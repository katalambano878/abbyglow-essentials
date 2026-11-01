import Link from 'next/link';
import PageHero from '@/components/PageHero';
import BlogNewsletterForm from './BlogNewsletterForm';
import { loadPublishedPosts, formatPostDate, BLOG_PLACEHOLDER } from './load-posts';

// Posts come from the database at request time; never prerender against it.
export const dynamic = 'force-dynamic';

export default async function BlogPage() {
  const allPosts = await loadPublishedPosts();
  const [featuredPost, ...posts] = allPosts;

  const categories = Array.from(
    allPosts.reduce<Map<string, number>>((acc, p) => acc.set(p.category, (acc.get(p.category) || 0) + 1), new Map())
  );

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="Blog"
        subtitle="Tips, product guides & glow updates."
        backgroundImage="/blog-hero.png"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {featuredPost && (
          <Link href={`/blog/${featuredPost.slug}`} className="block mb-16 hover:opacity-90 transition-opacity cursor-pointer">
            <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
              <div className="grid md:grid-cols-2 gap-0">
                <div className="relative h-96 md:h-auto">
                  <img
                    src={featuredPost.image || BLOG_PLACEHOLDER}
                    alt={featuredPost.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-6 left-6">
                    <span className="bg-brand text-white px-4 py-2 rounded-full text-sm font-medium">
                      Featured
                    </span>
                  </div>
                </div>
                <div className="p-12 flex flex-col justify-center">
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
                    <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-medium">
                      {featuredPost.category}
                    </span>
                    <span>{formatPostDate(featuredPost.publishedAt)}</span>
                    <span className="flex items-center gap-1">
                      <i className="ri-time-line"></i>
                      {featuredPost.readTime}
                    </span>
                  </div>
                  <h2 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">
                    {featuredPost.title}
                  </h2>
                  <p className="text-gray-600 mb-6 leading-relaxed text-lg">
                    {featuredPost.excerpt}
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-soft rounded-full flex items-center justify-center">
                      <i className="ri-user-line text-brand"></i>
                    </div>
                    <span className="text-gray-900 font-medium">{featuredPost.author}</span>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        )}

        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Latest Articles</h2>
            {posts.length === 0 ? (
              <p className="text-gray-500">More articles are on the way. Subscribe to hear when they land.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-8">
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/blog/${post.slug}`}
                    className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all cursor-pointer"
                  >
                    <div className="relative h-64">
                      <img
                        src={post.image || BLOG_PLACEHOLDER}
                        alt={post.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-6">
                      <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                        <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium text-xs">
                          {post.category}
                        </span>
                        <span className="text-xs">{formatPostDate(post.publishedAt)}</span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-3 leading-tight">
                        {post.title}
                      </h3>
                      <p className="text-gray-600 mb-4 leading-relaxed text-sm">
                        {post.excerpt}
                      </p>
                      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            <i className="ri-user-line text-gray-600 text-sm"></i>
                          </div>
                          <span className="text-sm text-gray-900 font-medium">{post.author}</span>
                        </div>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <i className="ri-time-line"></i>
                          {post.readTime}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="bg-gray-50 rounded-2xl p-6 mb-8 sticky top-24">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Topics</h3>
              <div className="space-y-2">
                {categories.map(([name, count]) => (
                  <div
                    key={name}
                    className="w-full flex items-center justify-between p-3 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <i className="ri-price-tag-3-line text-brand"></i>
                      <span className="text-gray-900 font-medium">{name}</span>
                    </div>
                    <span className="text-sm text-gray-500">{count}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-8 border-t border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Newsletter</h3>
                <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                  Get new articles, glow tips and offers in your inbox.
                </p>
                <BlogNewsletterForm source="blog" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-brand to-brand-dark py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Start Shopping?</h2>
          <p className="text-xl text-white/80 mb-8 leading-relaxed">
            Browse our bath, body and glow essentials with delivery across Ghana
          </p>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 bg-white text-brand px-8 py-4 rounded-full font-medium hover:bg-brand-soft transition-colors whitespace-nowrap"
          >
            Explore Products
            <i className="ri-arrow-right-line"></i>
          </Link>
        </div>
      </div>
    </div>
  );
}
