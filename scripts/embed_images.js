/**
 * 把 notebook 里 md 引用的图片内嵌进文档，让 md 单文件自包含。
 *
 * 默认输出 base64 PNG —— 兼容性最高，几乎所有 Markdown 阅读器都能显示（不少阅读器会
 * 过滤掉 SVG，无论内联源码还是 data URI，所以用 PNG 兜底）。每张图只占 md 的一行。
 *
 * 内嵌时会写入 <!-- embed:原路径 alt="原alt" --> 标记，因此脚本可重复运行：
 *   node scripts/embed_images.js             内嵌（默认 base64 PNG，兼容性最好）
 *   node scripts/embed_images.js --vector    内嵌 base64 矢量 SVG（更小更清晰，但部分阅读器不显示）
 *   node scripts/embed_images.js --svg-src   内嵌可读的 SVG 源码（占几十行，便于手改）
 *   node scripts/embed_images.js --restore   还原成外链引用
 *
 * 依赖 sharp：NODE_PATH=<managed node workspace>/node_modules node scripts/embed_images.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', 'notebook');
const MAX_PNG_WIDTH = 1100; // 位图内嵌前的最大宽度，控制 md 体积（配合调色板量化，单张约 110KB）

const restore = process.argv.includes('--restore');
// 内嵌 base64 矢量 SVG：体积更小、放大不模糊，但部分阅读器不显示 SVG
const asVector = process.argv.includes('--vector');
// 少数情况下想在 md 里直接改图形状时用：内嵌可读的 SVG 源码（代价是每张图占几十行）
const asSvgSource = process.argv.includes('--svg-src');

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
  // 内联到 HTML 时没有 width/height，靠 viewBox + max-width 自适应
  const style = ' style="max-width:100%;height:auto;display:block;margin:10px auto;"';
  return svg.replace(/^<svg/, `<svg${style}`);
}

// ---------- 还原 ----------

const RESTORE_RE =
  /<!-- embed:(\S+) alt="([^"]*)" -->\s*(?:<svg[\s\S]*?<\/svg>|!\[[^\]]*\]\(data:[^)]*\))/g;

function restoreMd(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(RESTORE_RE, (_m, imgPath, alt) => `![${alt}](${imgPath})`);
  if (out !== src) {
    fs.writeFileSync(file, out);
    return true;
  }
  return false;
}

// ---------- 内嵌 ----------

const IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

async function embedMd(file) {
  const mdDir = path.dirname(file);
  const src = fs.readFileSync(file, 'utf8');
  const stemOf = (p) => path.basename(p, path.extname(p));

  let counter = 0;
  const stats = { svg: 0, png: 0, missing: [] };
  const jobs = [];

  let out = src.replace(IMG_RE, (full, alt, imgPath) => {
    if (imgPath.startsWith('data:')) return full; // 已内嵌
    const abs = path.isAbsolute(imgPath) ? imgPath : path.resolve(mdDir, imgPath);
    if (!fs.existsSync(abs)) {
      stats.missing.push(path.relative(ROOT, file) + ' -> ' + imgPath);
      return full;
    }
    const idx = ++counter;
    jobs.push({ idx, alt, abs, imgPath });
    return `\u0000IMG${idx}\u0000`;
  });

  for (const job of jobs) {
    const relPath = path.relative(mdDir, job.abs).replace(/\\/g, '/');
    const svgPath = findSvg(job.abs);
    let block;
    if (svgPath && asSvgSource) {
      // 可读源码形态：需要就地手改图形状时用，代价是一张图占几十行
      let svg = fs.readFileSync(svgPath, 'utf8').trim();
      svg = svg.replace(/<\?xml[^>]*\?>/g, '').trim();
      svg = prependStyle(uniquifyIds(svg, `${sanitizePrefix(stemOf(job.abs))}-${job.idx}`));
      block = svg;
      stats.svg++;
    } else if (svgPath && asVector) {
      // 矢量形态：base64 SVG，体积小、放大不模糊，但部分阅读器会过滤 SVG
      let svg = fs.readFileSync(svgPath, 'utf8').trim();
      svg = svg.replace(/<\?xml[^>]*\?>/g, '').trim();
      block = `![${job.alt}](data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')})`;
      stats.svg++;
    } else {
      // 默认形态：base64 PNG，兼容性最好
      const meta = await sharp(job.abs).metadata();
      const pipeline = sharp(job.abs);
      if (meta.width && meta.width > MAX_PNG_WIDTH) {
        pipeline.resize({ width: MAX_PNG_WIDTH });
      }
      const buf = await pipeline
        .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10, colours: 256 })
        .toBuffer();
      block = `![${job.alt}](data:image/png;base64,${buf.toString('base64')})`;
      stats.png++;
    }
    out = out.replace(`\u0000IMG${job.idx}\u0000`, `<!-- embed:${relPath} alt="${job.alt}" -->\n${block}`);
  }

  if (out !== src) fs.writeFileSync(file, out);
  return stats;
}

// ---------- 主流程 ----------

(async () => {
  const files = walkMd(ROOT);
  if (restore) {
    let n = 0;
    for (const f of files) if (restoreMd(f)) n++;
    console.log(`已还原 ${n} 个文件`);
    return;
  }

  let totalSvg = 0;
  let totalPng = 0;
  const missing = [];
  const changed = [];
  for (const f of files) {
    const before = fs.statSync(f).size;
    const s = await embedMd(f);
    const after = fs.statSync(f).size;
    if (s.svg + s.png > 0) {
      changed.push({ f: path.relative(ROOT, f), kb: ((after - before) / 1024).toFixed(0), size: (after / 1024).toFixed(0) });
    }
    totalSvg += s.svg;
    totalPng += s.png;
    missing.push(...s.missing);
  }

  console.log(`内联 SVG ${totalSvg} 处，内嵌 PNG ${totalPng} 处，共处理 ${changed.length} 个文件`);
  for (const c of changed) console.log(`  ${c.f}  +${c.kb}KB  现 ${c.size}KB`);
  if (missing.length) {
    console.log('\n以下引用找不到图片文件（未改动，需手工处理）：');
    for (const m of missing) console.log('  ' + m);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
