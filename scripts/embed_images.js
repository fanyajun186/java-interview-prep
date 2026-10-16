/**
 * 把 notebook 里 md 引用的图片内嵌进文档，让 md 单文件自包含。
 *
 * 为什么是现在这个形态（三次踩坑后的定案，改之前先读完）：
 *  1) 不能内联 SVG 源码 —— 一张图几十行 XML，刷屏，正文没法读；
 *  2) 不能内嵌 SVG（不管源码还是 data URI）—— 不少 Markdown 阅读器出于 XSS 考虑直接过滤
 *     SVG，图片根本不显示；
 *  3) 不能内嵌大体积 base64 PNG —— Typora 对超长 base64 有硬门槛（官方 issue #6057：base64
 *     过长时直接退化成显示原始文本）。实测 >100KB 基本不渲染，50~100KB 勉强。
 *
 * 默认形态 = **行内 base64 PNG**：
 *  - PNG 走普通图片通道，兼容性最好；
 *  - 16 色调色板是 PNG 的 4bpp 分界线（32/64 色会落到 8bpp，体积直接翻倍），实测肉眼无损；
 *  - 宽度自适应：从 900px 往下试，取第一个能让 base64 长度 ≤ BUDGET 的档位，保证每张图都进
 *    Typora 的渲染安全区（官方 issue #6057：base64 过长时直接退化成显示编码文本）；
 *  - **必须是行内 `![alt](data:...)`**：曾试过「正文留短标签 + 编码集中放文件末尾」的引用式，
 *    Typora 能显示，但 WorkBuddy 的 md 预览解析不了那个悬空引用，图变成一段标签文字。
 *    行内写法是最朴素的形态，markdown-it / Typora 都认。
 *
 * 用法（依赖 sharp，需 NODE_PATH 指向 managed node workspace 的 node_modules）：
 *   node scripts/embed_images.js             内嵌（默认：行内 base64 PNG，Typora / WorkBuddy 通用）
 *   node scripts/embed_images.js --ref       内嵌为引用式（正文更干净，但 WorkBuddy 的 md 预览不认）
 *   node scripts/embed_images.js --vector    内嵌 base64 矢量 SVG（最小最清晰，但部分阅读器不显示 SVG）
 *   node scripts/embed_images.js --svg-src   内嵌可读的 SVG 源码（要就地手改图形状时用）
 *   node scripts/embed_images.js --restore   还原成 images/ 外链引用
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', 'notebook');

/** 单张图 base64 的字符数上限。超过这个量级，Typora 等阅读器会拒绝渲染（退化成显示编码文本）。 */
const BUDGET = 48000;
/** 宽度候选，从大到小试，取第一个不超预算的（越大越清晰） */
const WIDTH_CANDIDATES = [900, 850, 800, 750, 700, 640];
/** 调色板色数：16 色 = 4bpp，是 PNG 体积的甜蜜点；加到 32 色会掉进 8bpp，体积翻倍且肉眼无差别 */
const COLOURS = 16;

const DEF_BEGIN = '<!-- ===== 内嵌图片数据（由 scripts/embed_images.js 生成，勿手动修改）===== -->';
const DEF_END = '<!-- ===== 内嵌图片数据结束 ===== -->';
/** 引用式标签前缀，后面直接跟原图相对路径，还原时从标签里取路径 */
const LABEL_PREFIX = 'img:';

const restore = process.argv.includes('--restore');
const asVector = process.argv.includes('--vector');
const asSvgSource = process.argv.includes('--svg-src');
const forceRef = process.argv.includes('--ref');

// ---------- 工具 ----------

function walkMd(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '.workbuddy') continue;
      walkMd(p, out);
    } else if (e.name.endsWith('.md')) {
      out.push(p);
    }
  }
  return out;
}

/** 找 SVG 源：images/xxx.png -> images/svg-src/xxx.svg，也兼容图片与 md 同目录的情况 */
function findSvg(absImgPath) {
  const dir = path.dirname(absImgPath);
  const stem = path.basename(absImgPath, path.extname(absImgPath));
  const candidates = [
    path.join(dir, 'svg-src', stem + '.svg'),
    path.join(dir, stem + '.svg'),
    path.join(path.dirname(dir), 'svg-src', stem + '.svg'),
  ];
  return candidates.find((c) => fs.existsSync(c));
}

function sanitizePrefix(stem) {
  return stem.replace(/[^A-Za-z0-9_-]/g, '') || 'img';
}

/** 给 SVG 内部的 id 加前缀，避免同一 md 内多张图的 marker/defs 互相覆盖 */
function uniquifyIds(svg, prefix) {
  const ids = new Set();
  const idRe = /\sid="([^"]+)"/g;
  let m;
  while ((m = idRe.exec(svg))) ids.add(m[1]);
  let out = svg;
  for (const id of ids) {
    const nid = `${prefix}--${id}`;
    out = out.split(`id="${id}"`).join(`id="${nid}"`);
    out = out.split(`url(#${id})`).join(`url(#${nid})`);
  }
  return out;
}

function prependStyle(svg) {
  const style = ' style="max-width:100%;height:auto;display:block;margin:10px auto;"';
  return svg.replace(/^<svg/, `<svg${style}`);
}

/** 自适应编码：在宽度候选里挑最大的、且 base64 不超预算的档位 */
async function encodeCompact(abs) {
  const meta = await sharp(abs).metadata();
  const fits = WIDTH_CANDIDATES.filter((w) => !meta.width || w <= meta.width);
  const ordered = fits.length ? fits : [meta.width || WIDTH_CANDIDATES[0]];

  let smallest = null;
  for (const w of ordered) {
    const buf = await sharp(abs)
      .resize({ width: w, kernel: 'lanczos3' })
      .png({
        compressionLevel: 9,
        palette: true,
        quality: 85,
        effort: 10,
        colours: COLOURS,
        dither: 0,
      })
      .toBuffer();
    const b64 = buf.toString('base64');
    smallest = { w, b64 };
    if (b64.length <= BUDGET) return { w, b64, over: false };
  }
  // 连最小宽度都超预算：仍内嵌最小档，但标记出来让调用方报警
  return { ...smallest, over: true };
}

// ---------- 归一化 / 还原 ----------

/** 摘掉末尾的「内嵌图片数据」区块，返回 [去掉区块的正文, 标签 -> 原路径] */
function stripDefs(src) {
  const begin = src.indexOf(DEF_BEGIN);
  if (begin === -1) return [src, new Map()];
  const end = src.indexOf(DEF_END, begin);
  const blockEnd = end === -1 ? src.length : end + DEF_END.length;
  const block = src.slice(begin, blockEnd);
  const map = new Map();
  for (const m of block.matchAll(new RegExp(`^\\[(${LABEL_PREFIX}[^\\]]+)\\]:`, 'gm'))) {
    map.set(m[1], m[1].slice(LABEL_PREFIX.length));
  }
  const before = src.slice(0, begin).replace(/[ \t]+$/, '');
  const after = src.slice(blockEnd).replace(/^\s*/, '');
  const body = (before.replace(/\s+$/, '') + (after ? '\n\n' + after.replace(/\s+$/, '') : '')) + '\n';
  return [body, map];
}

/** 把 md 里所有「已内嵌」形态统一还原成 images/xxx.png 外链（新形态与历史形态都认） */
function normalizeMd(src) {
  const [body, map] = stripDefs(src);
  let out = body;

  // 新形态：![alt][img:images/xxx.png] -> ![alt](images/xxx.png)
  out = out.replace(/!\[([^\]]*)\]\[(img:[^\]]+)\]/g, (_m, alt, label) => {
    const p = map.get(label) || label.slice(LABEL_PREFIX.length);
    return `![${alt}](${p})`;
  });

  // 历史形态：<!-- embed:path alt="alt" --> + 紧随其后的 data URI 图 / 内联 SVG 源码
  out = out.replace(
    /<!-- embed:(\S+) alt="([^"]*)" -->\s*(?:<svg[\s\S]*?<\/svg>|!\[[^\]]*\]\(data:[^)]*\))/g,
    (_m, p, alt) => `![${alt}](${p})`
  );

  // 图丢了只剩标记的情况，清掉标记本身
  out = out.replace(/<!-- embed:\S+ alt="[^"]*" -->\n?/g, '');

  // 还没有原路径可回落的一行 data URI（理论上不该出现），保留不动交给人处理
  return out;
}

function restoreMd(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = normalizeMd(src);
  if (out !== src) {
    fs.writeFileSync(file, out);
    return true;
  }
  return false;
}

// ---------- 内嵌 ----------

/** 只匹配还没内嵌的外链引用 */
const IMG_RE = /!\[([^\]]*)\]\((?!data:)([^)\s]+)\)/g;

async function embedMd(file) {
  const mdDir = path.dirname(file);
  const original = fs.readFileSync(file, 'utf8');
  const src = normalizeMd(original);

  const stats = { svg: 0, png: 0, over: [], missing: [], widths: [] };
  const jobs = [];

  let out = src.replace(IMG_RE, (full, alt, imgPath) => {
    if (imgPath.startsWith('data:')) return full;
    const abs = path.isAbsolute(imgPath) ? imgPath : path.resolve(mdDir, imgPath);
    if (!fs.existsSync(abs)) {
      stats.missing.push(path.relative(ROOT, file).replace(/\\/g, '/') + ' -> ' + imgPath);
      return full;
    }
    jobs.push({
      idx: jobs.length + 1,
      alt,
      abs,
      rel: path.relative(mdDir, abs).replace(/\\/g, '/'),
    });
    return `\u0000IMG${jobs.length}\u0000`;
  });

  if (!jobs.length) {
    if (src !== original) fs.writeFileSync(file, src);
    return stats;
  }

  const defs = [];
  for (const job of jobs) {
    const svgPath = findSvg(job.abs);
    const stem = sanitizePrefix(path.basename(job.abs, path.extname(job.abs)));

    if (svgPath && asSvgSource) {
      let svg = fs.readFileSync(svgPath, 'utf8').trim().replace(/<\?xml[^>]*\?>/g, '').trim();
      out = out.replace(
        `\u0000IMG${job.idx}\u0000`,
        prependStyle(uniquifyIds(svg, `${stem}-${job.idx}`))
      );
      stats.svg++;
      continue;
    }

    if (svgPath && asVector) {
      const svg = fs.readFileSync(svgPath, 'utf8').trim().replace(/<\?xml[^>]*\?>/g, '').trim();
      const b64 = Buffer.from(svg, 'utf8').toString('base64');
      out = out.replace(`\u0000IMG${job.idx}\u0000`, `![${job.alt}](data:image/svg+xml;base64,${b64})`);
      stats.svg++;
      continue;
    }

    const { w, b64, over } = await encodeCompact(job.abs);
    stats.png++;
    stats.widths.push(`${job.rel.padEnd(40)} ${w}px  base64 ${String(Math.round(b64.length / 1024)).padStart(3)}KB`);
    if (over) stats.over.push(`${job.rel} @${w}px = ${Math.round(b64.length / 1024)}KB`);

    if (forceRef) {
      // 引用式：正文一行短标签，编码集中到文件末尾。Typora 能显示，WorkBuddy 的 md 预览不认。
      const label = LABEL_PREFIX + job.rel;
      defs.push(`[${label}]: data:image/png;base64,${b64}`);
      out = out.replace(`\u0000IMG${job.idx}\u0000`, `![${job.alt}][${label}]`);
    } else {
      // 默认：行内 data URI，最朴素的形态，markdown-it 与 Typora 都认
      out = out.replace(`\u0000IMG${job.idx}\u0000`, `![${job.alt}](data:image/png;base64,${b64})`);
    }
  }

  if (defs.length) {
    out = out.replace(/\s+$/, '') + '\n\n' + DEF_BEGIN + '\n\n' + defs.join('\n') + '\n\n' + DEF_END + '\n';
  }

  fs.writeFileSync(file, out);
  return stats;
}

// ---------- 主流程 ----------

(async () => {
  const files = walkMd(ROOT);

  if (restore) {
    let n = 0;
    for (const f of files) if (restoreMd(f)) n++;
    console.log(`已还原 ${n} 个文件为外链引用`);
    return;
  }

  const totals = { svg: 0, png: 0 };
  const changed = [];
  const allMissing = [];
  const allOver = [];
  const allWidths = [];

  for (const f of files) {
    const before = fs.statSync(f).size;
    const s = await embedMd(f);
    const after = fs.statSync(f).size;
    if (s.svg + s.png > 0) {
      changed.push({ f: path.relative(ROOT, f).replace(/\\/g, '/'), size: (after / 1024).toFixed(0) });
    }
    totals.svg += s.svg;
    totals.png += s.png;
    allMissing.push(...s.missing);
    allOver.push(...s.over);
    allWidths.push(...s.widths);
  }

  const mode = asSvgSource
    ? 'SVG 源码（可读，占多行）'
    : asVector
      ? 'base64 矢量 SVG'
      : forceRef
        ? '引用式 base64 PNG（WorkBuddy 的 md 预览不认，仅供 Typora 使用）'
        : '行内 base64 PNG（默认，Typora / WorkBuddy 通用）';
  console.log(`模式：${mode}`);
  console.log(`内嵌 SVG ${totals.svg} 处，内嵌 PNG ${totals.png} 处，涉及 ${changed.length} 个文件`);
  for (const c of changed) console.log(`  ${c.f.padEnd(46)} 现 ${c.size.padStart(4)}KB`);
  if (allWidths.length) {
    console.log('\n各图采用的档位：');
    for (const w of allWidths) console.log('  ' + w);
  }
  if (allOver.length) {
    console.log('\n⚠️  以下图片即使最小档位也超过预算，阅读器可能不渲染：');
    for (const o of allOver) console.log('  ' + o);
  }
  if (allMissing.length) {
    console.log('\n⚠️  以下引用找不到图片文件（未改动，需手工处理）：');
    for (const m of allMissing) console.log('  ' + m);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
