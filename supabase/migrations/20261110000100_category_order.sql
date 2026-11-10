-- Storefront category order: body & skin first, then grocery, home, electronics.
UPDATE categories SET position = v.position, updated_at = now()
  FROM (VALUES
    ('body-care',    1),
    ('beauty',       2),
    ('fragrance',    3),
    ('supplements',  4),
    ('grocery',      5),
    ('home-kitchen', 6),
    ('electronics',  7)
  ) AS v(slug, position)
 WHERE categories.slug = v.slug;

INSERT INTO schema_migrations (id, notes)
VALUES ('20261110000100_category_order', 'Body & skin categories first, then grocery, home, electronics')
ON CONFLICT (id) DO NOTHING;
