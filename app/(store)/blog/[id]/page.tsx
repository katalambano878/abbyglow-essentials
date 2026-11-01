import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { sanitizeHtml } from '@/lib/sanitize';
import { absoluteUrl, buildPageMetadata } from '@/lib/seo';
import ShareButtons from '../ShareButtons';
import BlogNewsletterForm from '../BlogNewsletterForm';
import { loadPost, loadPublishedPosts, formatPostDate, BLOG_PLACEHOLDER } from '../load-posts';

// Posts come from the database at request time; never prerender against it.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await loadPost(id);
  if (!post) {
    return buildPageMetadata({ title: 'Article Not Found', path: `/blog/${id}`, noindex: true });
  }
  return buildPageMetadata({
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    path: `/blog/${post.slug}`,
    ogImage: post.image,
    ogType: 'article',
    author: post.author,
    publishedTime: post.publishedAt || undefined,
    keywords: ['AbbyGlow Essentials blog', 'bath and body tips Ghana', post.category],
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await loadPost(id);
  if (!post) notFound();

  const relatedPosts = (await loadPublishedPosts())
    .filter((p) => p.id !== post.id)
    .slice(0, 2);

  const articleUrl = absoluteUrl(`/blog/${post.slug}`);

  return (
    <div className="min-h-screen bg-white">
      <div className="relative h-96 bg-gray-900">
        <img
          src={post.image || BLOG_PLACEHOLDER}
          alt={post.title}
          className="w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="inline-block bg-brand text-white px-4 py-2 rounded-full text-sm font-medium mb-4">
              {post.category}
            </span>
            <h1 className="text-3xl sm:text-5xl font-bold text-white mb-6">{post.title}</h1>
            <div className="flex flex-wrap items-center justify-center gap-6 text-white/80">
              <span className="flex items-center gap-2">
                <i className="ri-user-line"></i>
                {post.author}
              </span>
              {post.publishedAt && (
                <span className="flex items-center gap-2">
                  <i className="ri-calendar-line"></i>
                  {formatPostDate(post.publishedAt)}
                </span>
              )}
              <span className="flex items-center gap-2">
                <i className="ri-time-line"></i>
                {post.readTime}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <article className="prose prose-lg max-w-none">
          <div
            className="text-gray-600 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
            style={{
              fontSize: '1.125rem',
              lineHeight: '1.8'
            }}
          />
        </article>

        <div className="mt-12 pt-12 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-2">Written by</p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-brand-soft rounded-full flex items-center justify-center">
                  <i className="ri-user-line text-brand text-xl"></i>
                </div>
                <div>
                  <p className="font-bold text-gray-900">{post.author}</p>
                  <p className="text-sm text-gray-500">AbbyGlow Essentials</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-3">Share this article</p>
              <ShareButtons url={articleUrl} title={post.title} />
            </div>
          </div>
        </div>

        {relatedPosts.length > 0 && (
          <div className="mt-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Related Articles</h2>
            <div className="grid md:grid-cols-2 gap-8">
              {relatedPosts.map((relatedPost) => (
                <Link
                  key={relatedPost.id}
                  href={`/blog/${relatedPost.slug}`}
                  className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all cursor-pointer"
                >
                  <div className="relative h-48">
                    <img
                      src={relatedPost.image || BLOG_PLACEHOLDER}
                      alt={relatedPost.title}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-4 left-4 bg-brand text-white px-3 py-1 rounded-full text-xs font-medium">
                      {relatedPost.category}
                    </span>
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 leading-tight">
                      {relatedPost.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-16 bg-gradient-to-br from-brand to-brand-dark rounded-2xl p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Enjoyed This Article?</h2>
          <p className="text-white/80 mb-8 text-lg">
            Subscribe to our newsletter for more glow tips and exclusive offers
          </p>
          <BlogNewsletterForm source="blog_article" variant="banner" />
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-brand font-medium hover:gap-3 transition-all"
          >
            <i className="ri-arrow-left-line"></i>
            Back to Blog
          </Link>
        </div>
      </div>
    </div>
  );
}
