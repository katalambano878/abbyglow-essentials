/**
 * Seed AbbyGlow Essentials — general store catalog.
 * Image URLs are stored in Postgres:
 *   categories.image_url  → /images/categories/{slug}.png
 *   product_images.url    → /images/products/{product-slug}.png (falls back to category image)
 * Usage: npm run db:seed
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].trim();
  }
  throw new Error('DATABASE_URL missing');
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** DB-stored path for a category image (served from public/images). */
function categoryImageUrl(slug) {
  return `/images/categories/${slug}.png`;
}

/** DB-stored path for a product image; uses category image if product file missing. */
function productImageUrl(productSlug, categorySlug) {
  const file = path.join(publicRoot, 'images', 'products', `${productSlug}.png`);
  if (fs.existsSync(file)) return `/images/products/${productSlug}.png`;
  return categoryImageUrl(categorySlug);
}

const CATEGORIES = [
  { name: 'Electronics', slug: 'electronics', description: 'Phones, audio, laptops, and everyday tech', position: 1 },
  { name: 'Beauty & Skincare', slug: 'beauty', description: 'Skincare, makeup, and personal care', position: 2 },
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Appliances, cookware, and home essentials', position: 3 },
  { name: 'Fashion & Accessories', slug: 'fashion', description: 'Bags, watches, and everyday style', position: 4 },
  { name: 'Hair Care', slug: 'hair-care', description: 'Shampoos, oils, and styling essentials', position: 5 },
  { name: 'Fitness & Sports', slug: 'fitness', description: 'Gym gear, activewear, and workout essentials', position: 6 },
  { name: 'Phones & Gadgets', slug: 'phones-gadgets', description: 'Cases, cables, chargers, and accessories', position: 7 },
  { name: 'Fragrances', slug: 'fragrance', description: 'Perfumes, body mists, and scents', position: 8 },
];

const ACTIVE_SLUGS = CATEGORIES.map((c) => c.slug);

function generateProducts() {
  const catalog = [
    { base: 'Wireless Bluetooth Earbuds Pro', cat: 'electronics', price: 189, compare: 249, featured: true },
    { base: 'Portable Bluetooth Speaker', cat: 'electronics', price: 145, compare: 195, featured: true },
    { base: 'Smart LED Desk Lamp', cat: 'electronics', price: 98, compare: 130, featured: false },
    { base: '14" Laptop Stand & Hub', cat: 'electronics', price: 165, compare: 210, featured: false },
    { base: 'Digital Kitchen Scale', cat: 'electronics', price: 55, compare: 75, featured: false },
    { base: 'Vitamin C Brightening Serum', cat: 'beauty', price: 89, compare: 120, featured: true },
    { base: 'Daily Glow Moisturizer SPF 15', cat: 'beauty', price: 95, compare: 125, featured: true },
    { base: 'Gentle Foaming Face Wash', cat: 'beauty', price: 55, compare: 70, featured: false },
    { base: 'Soft Matte Lip Tint Set', cat: 'beauty', price: 62, compare: 82, featured: true },
    { base: 'Hyaluronic Hydrating Serum', cat: 'beauty', price: 79, compare: 105, featured: false },
    { base: 'Stainless Steel Cookware Set (5-Piece)', cat: 'home-kitchen', price: 320, compare: 420, featured: true },
    { base: 'Electric Blender 1.5L', cat: 'home-kitchen', price: 185, compare: 240, featured: true },
    { base: 'Non-Stick Frying Pan 28cm', cat: 'home-kitchen', price: 78, compare: 105, featured: false },
    { base: 'Glass Food Storage Set', cat: 'home-kitchen', price: 92, compare: 120, featured: false },
    { base: 'LED Night Light Pack (2)', cat: 'home-kitchen', price: 45, compare: 60, featured: false },
    { base: 'Leather Crossbody Bag', cat: 'fashion', price: 175, compare: 230, featured: true },
    { base: 'Minimalist Watch — Gold', cat: 'fashion', price: 210, compare: 280, featured: true },
    { base: 'Canvas Tote Bag', cat: 'fashion', price: 65, compare: 85, featured: false },
    { base: 'Sunglasses — Classic Aviator', cat: 'fashion', price: 88, compare: 115, featured: false },
    { base: 'Argan Repair Hair Oil', cat: 'hair-care', price: 88, compare: 115, featured: true },
    { base: 'Moisture Restore Shampoo', cat: 'hair-care', price: 58, compare: 75, featured: false },
    { base: 'Silk Press Heat Protectant', cat: 'hair-care', price: 76, compare: 99, featured: false },
    { base: 'Adjustable Dumbbell Set 20kg', cat: 'fitness', price: 450, compare: 580, featured: true },
    { base: 'Yoga Mat — Non-Slip', cat: 'fitness', price: 85, compare: 110, featured: true },
    { base: 'Resistance Bands Set', cat: 'fitness', price: 55, compare: 72, featured: false },
    { base: 'Sports Water Bottle 1L', cat: 'fitness', price: 42, compare: 55, featured: false },
    { base: 'Fast Charge Power Bank 20000mAh', cat: 'phones-gadgets', price: 125, compare: 165, featured: true },
    { base: 'USB-C Fast Charging Cable (3-Pack)', cat: 'phones-gadgets', price: 48, compare: 65, featured: false },
    { base: 'MagSafe Phone Case', cat: 'phones-gadgets', price: 58, compare: 78, featured: false },
    { base: 'Car Phone Mount', cat: 'phones-gadgets', price: 38, compare: 52, featured: false },
    { base: 'Vanilla Amber Eau de Parfum', cat: 'fragrance', price: 145, compare: 185, featured: true },
    { base: 'Rose Petal Body Mist', cat: 'fragrance', price: 84, compare: 110, featured: false },
    { base: 'Citrus Fresh Body Mist', cat: 'fragrance', price: 78, compare: 100, featured: false },
  ];

  return catalog.map((item) => {
    const name = `AbbyGlow ${item.base}`;
    const slug = slugify(name);
    return {
      name,
      slug,
      category: item.cat,
      price: item.price,
      compare: item.compare,
      image: productImageUrl(slug, item.cat),
      featured: item.featured,
      short: `${item.base} — quality you can trust, delivered across Ghana.`,
      description: `${item.base} from AbbyGlow Essentials. Curated for everyday life — electronics, beauty, home, fashion, and more. Delivered across Ghana.`,
      tags: ['abbyglow', item.cat.replace(/-/g, ' '), item.featured ? 'featured' : 'essentials'],
    };
  });
}

async function main() {
  const url = loadDatabaseUrl();
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20000 });
  await client.connect();
  console.log('Connected to', (await client.query('SELECT current_database()')).rows[0].current_database);

  const PRODUCTS = generateProducts();

  await client.query('BEGIN');
  try {
    const catIds = {};
    for (const cat of CATEGORIES) {
      const imageUrl = categoryImageUrl(cat.slug);
      const { rows } = await client.query(
        `INSERT INTO categories (name, slug, description, image_url, status, position, metadata)
         VALUES ($1, $2, $3, $4, 'active', $5, '{"featured": true}'::jsonb)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           image_url = EXCLUDED.image_url,
           status = 'active',
           position = EXCLUDED.position,
           metadata = COALESCE(categories.metadata, '{}'::jsonb) || '{"featured": true}'::jsonb
         RETURNING id, slug`,
        [cat.name, cat.slug, cat.description, imageUrl, cat.position]
      );
      catIds[rows[0].slug] = rows[0].id;
    }

    await client.query(
      `UPDATE categories SET status = 'inactive', updated_at = NOW()
       WHERE slug <> ALL($1::text[]) AND status = 'active'`,
      [ACTIVE_SLUGS]
    );

    for (const p of PRODUCTS) {
      const categoryId = catIds[p.category];
      if (!categoryId) {
        console.warn('skip missing category', p.category, p.name);
        continue;
      }

      const { rows } = await client.query(
        `INSERT INTO products (
           name, slug, description, short_description, price, compare_at_price,
           quantity, track_quantity, continue_selling, category_id, tags, brand,
           status, featured, moq, metadata, rating_avg, review_count
         ) VALUES (
           $1,$2,$3,$4,$5,$6,
           40, true, false, $7, $8::text[], 'AbbyGlow Essentials',
           'active', $9, 1, '{}'::jsonb, $10, $11
         )
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           short_description = EXCLUDED.short_description,
           price = EXCLUDED.price,
           compare_at_price = EXCLUDED.compare_at_price,
           category_id = EXCLUDED.category_id,
           tags = EXCLUDED.tags,
           brand = EXCLUDED.brand,
           status = 'active',
           featured = EXCLUDED.featured,
           rating_avg = EXCLUDED.rating_avg,
           review_count = EXCLUDED.review_count,
           updated_at = NOW()
         RETURNING id, slug`,
        [
          p.name,
          p.slug,
          p.description,
          p.short,
          p.price,
          p.compare,
          categoryId,
          p.tags,
          p.featured,
          4.2 + Math.random() * 0.7,
          8 + Math.floor(Math.random() * 40),
        ]
      );

      const productId = rows[0].id;
      await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
      await client.query(
        `INSERT INTO product_images (product_id, url, alt_text, position)
         VALUES ($1, $2, $3, 0)`,
        [productId, p.image, p.name]
      );
    }

    const activeSlugs = PRODUCTS.map((p) => p.slug);
    await client.query(
      `UPDATE products SET status = 'archived', updated_at = NOW()
       WHERE slug <> ALL($1::text[]) AND brand = 'AbbyGlow Essentials' AND status = 'active'`,
      [activeSlugs]
    );

    await client.query('COMMIT');

    const counts = await client.query(
      `SELECT
         (SELECT count(*)::int FROM products WHERE status='active') AS products,
         (SELECT count(*)::int FROM categories WHERE status='active') AS categories,
         (SELECT count(*)::int FROM product_images) AS images`
    );
    const localProducts = fs.readdirSync(path.join(publicRoot, 'images', 'products')).length;
    const localCategories = fs.readdirSync(path.join(publicRoot, 'images', 'categories')).length;
    console.log('DONE', counts.rows[0], { localProductFiles: localProducts, localCategoryFiles: localCategories });
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
