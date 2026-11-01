import { supabaseAdmin } from '@/lib/supabase-admin';
import { STATIC_POSTS, getStaticPost } from './static-posts';

export const BLOG_PLACEHOLDER = '/blog-hero.png';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  image: string;
  category: string;
  author: string;
  readTime: string;
  publishedAt: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** true when the post came from the in-repo fallback set */
  isStatic: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function estimateReadTime(html: string): string {
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

function mapRow(row: any): BlogPost {
  const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt:
      row.excerpt ||
      String(row.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160),
    content: row.content || '',
    image: row.featured_image || BLOG_PLACEHOLDER,
    category: tags[0] || 'Glow Tips',
    author: 'AbbyGlow Team',
    readTime: estimateReadTime(row.content || ''),
    publishedAt: row.published_at || row.created_at || null,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    isStatic: false,
  };
}

function mapStatic(p: (typeof STATIC_POSTS)[number]): BlogPost {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    content: p.content,
    image: p.image,
    category: p.category,
    author: p.author,
    readTime: p.readTime,
    publishedAt: p.isoDate,
    isStatic: true,
  };
}

export function formatPostDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Published posts, newest first. Falls back to the static set when the table is empty. */
export async function loadPublishedPosts(): Promise<BlogPost[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('blog_posts')
      .select('id, title, slug, excerpt, content, featured_image, status, published_at, created_at, seo_title, seo_description, tags')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50);
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(mapRow);
    }
  } catch (err: any) {
    console.error('[blog] loadPublishedPosts failed:', err?.message || err);
  }
  return STATIC_POSTS.map(mapStatic);
}

/** One published post by slug (or uuid). Falls back to a static post with that id. */
export async function loadPost(idOrSlug: string): Promise<BlogPost | null> {
  try {
    let qb = supabaseAdmin
      .from('blog_posts')
      .select('id, title, slug, excerpt, content, featured_image, status, published_at, created_at, seo_title, seo_description, tags')
      .eq('status', 'published');
    qb = UUID_REGEX.test(idOrSlug) ? qb.eq('id', idOrSlug) : qb.eq('slug', idOrSlug);
    const { data, error } = await qb.maybeSingle();
    if (!error && data) return mapRow(data);
  } catch (err: any) {
    console.error('[blog] loadPost failed:', err?.message || err);
  }
  const fallback = getStaticPost(idOrSlug);
  return fallback ? mapStatic(fallback) : null;
}
