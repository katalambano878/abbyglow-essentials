/**
 * Seed demo products into store_abbyglow using hero photos already in /public.
 * Usage: node scripts/seed-demo-products.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('Missing .env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('DATABASE_URL missing in .env.local');
  return m[1].trim();
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const CATEGORIES = [
  { name: 'Fashion', slug: 'fashion', description: 'Everyday fashion and apparel', image: '/hero-1.png' },
  { name: 'Beauty', slug: 'beauty', description: 'Fragrance and beauty essentials', image: '/hero-2.png' },
  { name: 'Activewear', slug: 'activewear', description: 'Sets and athletic wear', image: '/hero-3.png' },
  { name: 'Home', slug: 'home', description: 'Home and kitchen essentials', image: '/shop-hero.png' },
  { name: 'Electronics', slug: 'electronics', description: 'Power and gadgets', image: '/cart-hero.png' },
  { name: 'Accessories', slug: 'accessories', description: 'Watches and finishing touches', image: '/contact-hero.png' },
];

// Map demo products to existing public hero images
const PRODUCTS = [
  {
    name: 'Ribbed Knit Jumpsuit Set',
    category: 'fashion',
    price: 189.0,
    compare: 249.0,
    image: '/hero-1.png',
    short: 'Soft ribbed jumpsuits in white, pink, and blue.',
    description: 'Comfortable short-sleeve ribbed jumpsuits with a flattering fit. Perfect for everyday wear in Accra heat.',
    featured: true,
    tags: ['fashion', 'women', 'new'],
  },
  {
    name: 'Luxury Perfume Collection',
    category: 'beauty',
    price: 120.0,
    compare: 160.0,
    image: '/hero-2.png',
    short: 'Curated eau de parfum picks for every mood.',
    description: 'A selection of premium fragrances featuring feminine and bold scents. Ideal gift set or personal staple.',
    featured: true,
    tags: ['beauty', 'fragrance'],
  },
  {
    name: 'Colorblock Activewear Set',
    category: 'activewear',
    price: 149.0,
    compare: 199.0,
    image: '/hero-3.png',
    short: 'Matching tee and shorts sets in five rich colors.',
    description: 'Breathable athletic sets with high-waist shorts and crew tees. Train, lounge, or run errands in style.',
    featured: true,
    tags: ['activewear', 'sets'],
  },
  {
    name: 'IDONNOR Granite Cookware Set',
    category: 'home',
    price: 320.0,
    compare: 420.0,
    image: '/shop-hero.png',
    short: 'X3 pcs granite cookware for gas and induction.',
    description: 'Durable speckled granite pots and pan with red handles. Compatible with gas, electric, ceramic, halogen, and induction.',
    featured: true,
    tags: ['home', 'kitchen'],
  },
  {
    name: 'Ribbed Crop Top Bundle',
    category: 'fashion',
    price: 95.0,
    compare: 130.0,
    image: '/about-hero.png',
    short: 'Four-pack mock-neck crop tops in neutrals.',
    description: 'Black, white, chocolate, and cream ribbed crop tops. Soft stretch fabric for everyday layering.',
    featured: true,
    tags: ['fashion', 'tops'],
  },
  {
    name: 'Summer Baby Tee Collection',
    category: 'fashion',
    price: 85.0,
    compare: 110.0,
    image: '/blog-hero.png',
    short: 'Soft ribbed baby tees in pastel and neutrals.',
    description: 'Lightweight crew-neck baby tees in seven seasonal colors. Easy everyday style for warm weather.',
    featured: true,
    tags: ['fashion', 'tees'],
  },
  {
    name: 'Essential Tank Top Pack',
    category: 'activewear',
    price: 110.0,
    compare: 145.0,
    image: '/categories-hero.png',
    short: 'Black and grey ribbed tanks with denim pairings.',
    description: 'Scoop-neck ribbed tanks in classic neutrals. Pair with jeans or shorts for a clean casual look.',
    featured: true,
    tags: ['activewear', 'basics'],
  },
  {
    name: 'Silent Diesel Generator DG6500SE',
    category: 'electronics',
    price: 4500.0,
    compare: 5200.0,
    image: '/cart-hero.png',
    short: 'Portable silent diesel generator for home backup.',
    description: 'Quiet portable diesel generator with AC outlets and DC terminals. Reliable backup power for home and shop.',
    featured: true,
    tags: ['electronics', 'power'],
  },
  {
    name: 'Kaluniya Crystal Leather Watch',
    category: 'accessories',
    price: 280.0,
    compare: 350.0,
    image: '/contact-hero.png',
    short: 'Women\'s luxury watch with red leather strap.',
    description: 'Elegant timepiece with crystal bezel, mother-of-pearl face, and burgundy leather strap in a gift box.',
    featured: true,
    tags: ['accessories', 'watches'],
  },
  {
    name: 'Neutral Mock-Neck Tops',
    category: 'fashion',
    price: 99.0,
    compare: 135.0,
    image: '/faqs-hero.png',
    short: 'Grey, cream, black, and white mock-neck tops.',
    description: 'Fine rib mock-neck short sleeves in four wardrobe neutrals. Soft, fitted, and easy to style.',
    featured: true,
    tags: ['fashion', 'tops'],
  },
];

async function main() {
  const url = loadEnv();
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
  await client.connect();
  console.log('Connected to', (await client.query('SELECT current_database()')).rows[0].current_database);

  await client.query('BEGIN');
  try {
    const catIds = {};
    for (const cat of CATEGORIES) {
      const { rows } = await client.query(
        `INSERT INTO categories (name, slug, description, image_url, status, metadata)
         VALUES ($1, $2, $3, $4, 'active', '{"featured": true}'::jsonb)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           image_url = EXCLUDED.image_url,
           status = 'active',
           metadata = COALESCE(categories.metadata, '{}'::jsonb) || '{"featured": true}'::jsonb
         RETURNING id, slug`,
        [cat.name, cat.slug, cat.description, cat.image]
      );
      catIds[rows[0].slug] = rows[0].id;
      console.log('category', rows[0].slug);
    }

    for (const p of PRODUCTS) {
      const slug = slugify(p.name);
      const categoryId = catIds[p.category];
      const { rows } = await client.query(
        `INSERT INTO products (
           name, slug, description, short_description, price, compare_at_price,
           quantity, track_quantity, continue_selling, category_id, tags,
           status, featured, moq, metadata
         ) VALUES (
           $1,$2,$3,$4,$5,$6,
           50, true, false, $7, $8::text[],
           'active', $9, 1, '{}'::jsonb
         )
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           short_description = EXCLUDED.short_description,
           price = EXCLUDED.price,
           compare_at_price = EXCLUDED.compare_at_price,
           category_id = EXCLUDED.category_id,
           tags = EXCLUDED.tags,
           status = 'active',
           featured = EXCLUDED.featured,
           updated_at = NOW()
         RETURNING id, slug`,
        [
          p.name,
          slug,
          p.description,
          p.short,
          p.price,
          p.compare,
          categoryId,
          p.tags,
          p.featured,
        ]
      );
      const productId = rows[0].id;

      // Reset images for this product then insert primary
      await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
      await client.query(
        `INSERT INTO product_images (product_id, url, alt_text, position)
         VALUES ($1, $2, $3, 0)`,
        [productId, p.image, p.name]
      );
      console.log('product', rows[0].slug, '->', p.image);
    }

    await client.query('COMMIT');
    const counts = await client.query(
      `SELECT
         (SELECT count(*)::int FROM products WHERE status='active') AS products,
         (SELECT count(*)::int FROM categories WHERE status='active') AS categories,
         (SELECT count(*)::int FROM product_images) AS images`
    );
    console.log('DONE', counts.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
