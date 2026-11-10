-- Supplements becomes a top-level category with its own sub-categories.
-- Data-only migration; safe to re-run.

BEGIN;

-- 1. Promote Supplements and slot it after Beauty & Skincare.
UPDATE categories SET position = position + 1
 WHERE parent_id IS NULL AND status = 'active' AND position >= 3 AND slug <> 'supplements';

UPDATE categories
   SET parent_id = NULL,
       position = 3,
       metadata = coalesce(metadata, '{}'::jsonb) || '{"featured": true}'::jsonb,
       description = coalesce(nullif(description, ''), 'Vitamins, probiotics, collagen and everyday wellness'),
       updated_at = now()
 WHERE slug = 'supplements';

-- 2. Sub-categories under Supplements.
INSERT INTO categories (name, slug, description, parent_id, status, position, metadata)
SELECT v.name, v.slug, v.description, s.id, 'active', v.position, '{"featured": false}'::jsonb
  FROM categories s,
       (VALUES
          ('Vitamins & Multivitamins',      'vitamins',        'Daily multivitamins for women, men and kids', 1),
          ('Probiotics & Digestive Health', 'probiotics',      'Gut health and digestive relief',             2),
          ('Collagen, Hair, Skin & Nails',  'collagen-beauty', 'Beauty-from-within supplements',              3),
          ('Brain & Focus',                 'brain-focus',     'Memory, focus and cognitive support',         4),
          ('Pain Relief & Wellness',        'pain-relief',     'Everyday relief and wellness essentials',     5)
       ) AS v(name, slug, description, position)
 WHERE s.slug = 'supplements'
ON CONFLICT (slug) DO UPDATE
   SET parent_id = EXCLUDED.parent_id,
       status = 'active',
       position = EXCLUDED.position,
       updated_at = now();

-- 3. Move each supplement into its sub-category (matched by product name).
WITH assignment(slug, pattern) AS (VALUES
  ('vitamins',        '^(Kirkland Signature Children''s Daily Multivitamin Gummies|Olly Kids Multi \+ Probiotic|Olly Men''s Multivitamin|Olly Women''s Multivitamin|Vitafusion Women''s Multi)$'),
  ('probiotics',      '^(Align Probiotic|Pepto Bismol Ultra)$'),
  ('collagen-beauty', '^(Nature''s Bounty Hair Skin and Nails|Vital Proteins Collagen Gummies|Youtheory Verisol Collagen)$'),
  ('brain-focus',     '^(Focus Factor|Focus Factor Kids|Qunol Brain Health Memory Plus)$'),
  ('pain-relief',     '^(Bayer Low Dose|Bengay Ultra Strength|Curve Gainer)$')
)
UPDATE products p
   SET category_id = c.id, updated_at = now()
  FROM assignment a
  JOIN categories c ON c.slug = a.slug
 WHERE p.name ~ a.pattern
   AND p.category_id IN (SELECT id FROM categories WHERE slug = 'supplements');

INSERT INTO schema_migrations (id, notes)
VALUES ('20261110000000_supplements_top_level', 'Supplements promoted to top level with five sub-categories')
ON CONFLICT (id) DO NOTHING;

COMMIT;
