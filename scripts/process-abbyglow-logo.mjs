/**
 * Remove dark background from AbbyGlow logo → transparent PNG.
 * Usage: node scripts/process-abbyglow-logo.mjs [source.png]
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const source =
  process.argv[2] ||
  path.join(
    root,
    'public',
    'abbyglow-logo-source.png'
  );

if (!fs.existsSync(source)) {
  console.error('Source logo not found:', source);
  process.exit(1);
}

const { data, info } = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  // Dark teal/charcoal backdrop → transparent; keep bright teal logo
  if (lum < 72) {
    data[i + 3] = 0;
  } else if (lum < 95) {
    data[i + 3] = Math.min(data[i + 3], Math.round(((lum - 72) / 23) * 255));
  }
}

const png = await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .trim()
  .png()
  .toBuffer();

const logoMeta = await sharp(png).metadata();

const outLogo = path.join(root, 'public', 'logo.png');
await fs.promises.writeFile(outLogo, png);

// Wide header variant (same asset, works on white header)
await fs.promises.copyFile(outLogo, path.join(root, 'public', 'logo-wide.png'));

// Favicon / PWA icons from logo crop center
const icon512 = await sharp(png).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await fs.promises.writeFile(path.join(root, 'public', 'icon-512.png'), icon512);
await fs.promises.writeFile(path.join(root, 'public', 'icon-192.png'), await sharp(icon512).resize(192, 192).png().toBuffer());
await fs.promises.writeFile(path.join(root, 'public', 'apple-touch-icon.png'), await sharp(icon512).resize(180, 180).png().toBuffer());
await fs.promises.writeFile(path.join(root, 'public', 'favicon.png'), await sharp(icon512).resize(64, 64).png().toBuffer());
await fs.promises.writeFile(path.join(root, 'public', 'favicon-32.png'), await sharp(icon512).resize(32, 32).png().toBuffer());
await fs.promises.writeFile(path.join(root, 'public', 'brand-mark.png'), await sharp(icon512).resize(256, 256).png().toBuffer());

console.log(
  'Wrote',
  outLogo,
  `(${logoMeta.width}x${logoMeta.height})`,
  'and icon variants'
);
