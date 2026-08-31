/**
 * Copy generated assets into public/images/products/{slug}.png
 * Run before db:seed so productImageUrl() finds the files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const assets = path.join(root, '..', '..', '..', '.cursor', 'projects', 'c-Users-hp-OneDrive-Desktop-websites-abbyglow', 'assets');
// Fallback: assets next to workspace via env or relative from scripts
const assetsDirs = [
  process.env.ABBYGLOW_ASSETS_DIR,
  path.join('C:', 'Users', 'hp', '.cursor', 'projects', 'c-Users-hp-OneDrive-Desktop-websites-abbyglow', 'assets'),
  path.join(root, 'assets'),
].filter(Boolean);

function resolveAssetsDir() {
  for (const dir of assetsDirs) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error('Assets directory not found');
}

const MAP = {
  'product-earbuds.png': 'abbyglow-wireless-bluetooth-earbuds-pro.png',
  'product-speaker.png': 'abbyglow-portable-bluetooth-speaker.png',
  'product-desk-lamp.png': [
    'abbyglow-smart-led-desk-lamp.png',
    'abbyglow-led-night-light-pack-2.png',
  ],
  'product-laptop-stand.png': 'abbyglow-14-laptop-stand-hub.png',
  'product-kitchen-scale.png': 'abbyglow-digital-kitchen-scale.png',
  'product-lip-tint.png': 'abbyglow-soft-matte-lip-tint-set.png',
  'product-cookware.png': [
    'abbyglow-stainless-steel-cookware-set-5-piece.png',
    'abbyglow-non-stick-frying-pan-28cm.png',
    'abbyglow-glass-food-storage-set.png',
  ],
  'product-blender.png': 'abbyglow-electric-blender-1-5l.png',
  'product-crossbody-bag.png': [
    'abbyglow-leather-crossbody-bag.png',
    'abbyglow-canvas-tote-bag.png',
  ],
  'product-watch.png': 'abbyglow-minimalist-watch-gold.png',
  'product-sunglasses.png': 'abbyglow-sunglasses-classic-aviator.png',
  'product-hair-oil.png': [
    'abbyglow-argan-repair-hair-oil.png',
    'abbyglow-moisture-restore-shampoo.png',
    'abbyglow-silk-press-heat-protectant.png',
  ],
  'product-dumbbells.png': 'abbyglow-adjustable-dumbbell-set-20kg.png',
  'product-yoga-mat.png': [
    'abbyglow-yoga-mat-non-slip.png',
    'abbyglow-resistance-bands-set.png',
    'abbyglow-sports-water-bottle-1l.png',
  ],
  'product-powerbank.png': 'abbyglow-fast-charge-power-bank-20000mah.png',
  'product-usb-cable.png': 'abbyglow-usb-c-fast-charging-cable-3-pack.png',
  'product-phone-case.png': [
    'abbyglow-magsafe-phone-case.png',
    'abbyglow-car-phone-mount.png',
  ],
  'product-perfume.png': [
    'abbyglow-vanilla-amber-eau-de-parfum.png',
    'abbyglow-rose-petal-body-mist.png',
    'abbyglow-citrus-fresh-body-mist.png',
  ],
  'product-vitamin-c-serum.png': 'abbyglow-vitamin-c-brightening-serum.png',
  'product-hyaluronic-serum.png': 'abbyglow-hyaluronic-hydrating-serum.png',
  'product-face-wash.png': 'abbyglow-gentle-foaming-face-wash.png',
  'product-moisturizer.png': 'abbyglow-daily-glow-moisturizer-spf-15.png',
};

const srcDir = resolveAssetsDir();
const destDir = path.join(root, 'public', 'images', 'products');
fs.mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const [srcName, dest] of Object.entries(MAP)) {
  const srcPath = path.join(srcDir, srcName);
  if (!fs.existsSync(srcPath)) {
    console.warn('missing asset', srcName);
    continue;
  }
  const targets = Array.isArray(dest) ? dest : [dest];
  for (const target of targets) {
    fs.copyFileSync(srcPath, path.join(destDir, target));
    copied++;
  }
}

console.log(`Installed ${copied} product images into public/images/products`);
