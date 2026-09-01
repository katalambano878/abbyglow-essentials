#!/usr/bin/env node
/**
 * Remove white background from AbbyGlow logo and generate brand assets.
 * Usage: node scripts/install-brand-logo.mjs [source.png]
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const brandDir = join(publicDir, 'brand');

const defaultSource = join(
  root,
  'assets',
  'brand',
  'abbyglow-logo-source.png',
);

const sourceArg = process.argv[2];
const source = sourceArg ? join(process.cwd(), sourceArg) : defaultSource;

if (!existsSync(source)) {
  console.error('Source logo not found:', source);
  process.exit(1);
}

mkdirSync(brandDir, { recursive: true });
copyFileSync(source, join(brandDir, 'logo-source.png'));

function removeWhiteBackground(inputBuffer) {
  return sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      const { width, height, channels } = info;
      for (let i = 0; i < data.length; i += channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const whiteness = (r + g + b) / 3;

        // Solid white / off-white background
        if (whiteness >= 248 && max - min < 12) {
          data[i + 3] = 0;
          continue;
        }

        // Soft anti-alias edge near white
        if (whiteness >= 230 && max - min < 20) {
          const alpha = Math.max(0, Math.min(255, Math.floor((248 - whiteness) * 18)));
          data[i + 3] = Math.min(data[i + 3], alpha);
        }
      }

      return sharp(Buffer.from(data), {
        raw: { width, height, channels },
      }).png();
    });
}

async function trimTransparent(png) {
  return png.trim({ threshold: 10 });
}

async function writePng(pipeline, outPath, resize) {
  let img = pipeline.clone();
  if (resize) {
    img = img.resize(resize.width, resize.height, {
      fit: resize.fit || 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  await img.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outPath);
  console.log('  ->', outPath.replace(root, '').replace(/\\/g, '/'));
}

async function makeLightVariant(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 8) continue;

    const isGreen = g > 150 && g > r * 1.15 && g > b * 1.05;
    if (!isGreen && (r + g + b) / 3 < 130) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }

  return sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
}

async function buildOgImage(logoBuffer) {
  const canvas = sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 10, g: 10, b: 10, alpha: 255 },
    },
  });

  const logo = await sharp(logoBuffer)
    .resize(520, 520, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const logoMeta = await sharp(logo).metadata();
  const left = Math.round((1200 - (logoMeta.width || 520)) / 2);
  const top = Math.round((630 - (logoMeta.height || 520)) / 2);

  return canvas
    .composite([{ input: logo, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, 'og-image.png'));
}

async function main() {
  console.log('Processing logo from', source);

  const input = await sharp(source).rotate().toBuffer();
  const transparent = await removeWhiteBackground(input);
  const trimmed = await trimTransparent(transparent);
  const logoBuffer = await trimmed.png().toBuffer();
  const meta = await sharp(logoBuffer).metadata();

  // Drop baked-in "ELECTRONICS • BEAUTY • HOME & MORE" footer from source art
  const cropBottom = Math.round((meta.height || 1) * 0.13);
  const mainHeight = Math.max(1, (meta.height || 1) - cropBottom);
  const mainLogoBuffer = await sharp(logoBuffer)
    .extract({ left: 0, top: 0, width: meta.width || 1, height: mainHeight })
    .png()
    .toBuffer();
  const mainMeta = await sharp(mainLogoBuffer).metadata();

  console.log(`Trimmed logo: ${mainMeta.width}x${mainMeta.height}`);

  // Full logo for header / splash / admin
  await writePng(sharp(mainLogoBuffer), join(publicDir, 'logo.png'), {
    width: 320,
    height: 320,
    fit: 'inside',
  });

  const lightLogo = await makeLightVariant(mainLogoBuffer);
  await writePng(lightLogo, join(publicDir, 'logo-light.png'), {
    width: 320,
    height: 320,
    fit: 'inside',
  });

  // Monogram crop (~top 46% — AG mark for compact header + icons)
  const markHeight = Math.round((mainMeta.height || 1) * 0.46);
  const markBuffer = await sharp(mainLogoBuffer)
    .extract({ left: 0, top: 0, width: mainMeta.width || 1, height: markHeight })
    .png()
    .toBuffer();

  const markTrimmed = await sharp(markBuffer).trim({ threshold: 8 }).png().toBuffer();

  await writePng(sharp(markTrimmed), join(publicDir, 'logo-mark.png'), {
    width: 256,
    height: 256,
    fit: 'inside',
  });

  // Favicon / PWA icons: real monogram on white so A + G stay visible at tab size
  async function squareIcon(size) {
    const pad = Math.round(size * 0.14);
    const inner = Math.max(1, size - pad * 2);
    const placed = await sharp(markTrimmed)
      .resize(inner, inner, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 255 },
      },
    }).composite([{ input: placed, gravity: 'center' }]);
  }

  const iconTargets = [
    [join(publicDir, 'favicon.png'), 48],
    [join(publicDir, 'apple-touch-icon.png'), 180],
    [join(publicDir, 'icon-192.png'), 192],
    [join(publicDir, 'icon-512.png'), 512],
    [join(root, 'app', 'icon.png'), 512],
    [join(root, 'app', 'apple-icon.png'), 180],
  ];

  for (const [outPath, size] of iconTargets) {
    await (await squareIcon(size)).png({ compressionLevel: 9 }).toFile(outPath);
    console.log('  ->', outPath.replace(root, '').replace(/\\/g, '/'));
  }

  const icoPng = await (await squareIcon(32)).png().toBuffer();
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(1, 4);
  const icoEntry = Buffer.alloc(16);
  icoEntry.writeUInt8(32, 0);
  icoEntry.writeUInt8(32, 1);
  icoEntry.writeUInt8(0, 2);
  icoEntry.writeUInt8(0, 3);
  icoEntry.writeUInt16LE(1, 4);
  icoEntry.writeUInt16LE(32, 6);
  icoEntry.writeUInt32LE(icoPng.length, 8);
  icoEntry.writeUInt32LE(22, 12);
  writeFileSync(join(publicDir, 'favicon.ico'), Buffer.concat([icoHeader, icoEntry, icoPng]));
  console.log('  -> /public/favicon.ico');

  await buildOgImage(mainLogoBuffer);
  console.log('  -> /public/og-image.png');

  console.log('Done — logo assets installed in public/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
