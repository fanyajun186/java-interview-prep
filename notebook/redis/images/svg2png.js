// 将 svg-src 目录下所有 SVG 转为 PNG（2x 缩放保证清晰度）
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const srcDir = path.join(__dirname, 'svg-src');
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.svg'));

(async () => {
  for (const f of files) {
    const src = path.join(srcDir, f);
    const dst = path.join(__dirname, f.replace(/\.svg$/, '.png'));
    const svg = fs.readFileSync(src);
    const meta = await sharp(svg).metadata();
    await sharp(svg, { density: 150 })
      .resize(Math.round(meta.width * 2))
      .png()
      .toFile(dst);
    console.log('OK', f, '->', path.basename(dst));
  }
})().catch(e => { console.error(e); process.exit(1); });
