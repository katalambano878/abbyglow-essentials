import sharp from 'sharp';
import { writeFileSync } from 'fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#1C1917"/>
  <text x="50%" y="54%" text-anchor="middle" font-family="Georgia, serif" font-size="96" font-weight="700" fill="#FAF7F2">KM</text>
</svg>`;

const buf = Buffer.from(svg);
await sharp(buf).png().toFile('public/favicon.png');
await sharp(buf).resize(1200, 630, { fit: 'contain', background: '#1C1917' }).png().toFile('public/og-image.png');
await sharp(buf).png().toFile('public/image.png');
writeFileSync('public/brand-mark.svg', svg);
console.log('Generated favicon.png, og-image.png, image.png, brand-mark.svg');
