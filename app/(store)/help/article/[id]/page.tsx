import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { sanitizeHtml } from '@/lib/sanitize';
import { buildPageMetadata } from '@/lib/seo';
import HelpfulToggle from '../../HelpfulToggle';
import { HELP_ARTICLES, HELP_CATEGORIES, getHelpArticle, getRelatedArticles } from '../../articles';

const categoryTitle = (id: string) => HELP_CATEGORIES.find((c) => c.id === id)?.title || '';

export async function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const article = getHelpArticle(id);
  if (!article) {
    return buildPageMetadata({ title: 'Article Not Found', path: `/help/article/${id}`, noindex: true });
  }
  const description = article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  return buildPageMetadata({
    title: article.title,
    description,
    path: `/help/article/${article.id}`,
    ogType: 'article',
  });
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getHelpArticle(id);
  if (!article) notFound();

  const relatedArticles = getRelatedArticles(article);

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <Link
          href="/help"
          className="inline-flex items-center text-brand hover:text-brand-dark font-semibold mb-6 whitespace-nowrap"
        >
          <i className="ri-arrow-left-line mr-2"></i>
          Back to Help Center
        </Link>

        <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
          <div className="mb-6 pb-6 border-b border-gray-200">
            <div className="flex items-center space-x-3 mb-4">
              <span className="px-3 py-1 bg-brand-soft text-brand rounded-full text-sm font-semibold whitespace-nowrap">
                {categoryTitle(article.category)}
              </span>
              <span className="text-sm text-gray-500">
                Updated {article.updated}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{article.title}</h1>
          </div>

          <article
            className="prose prose-blue max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }}
            style={{
              lineHeight: '1.8'
            }}
          />
        </div>

        <HelpfulToggle />

        <div className="bg-white rounded-xl shadow-sm p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Related Articles</h3>
          <div className="space-y-3">
            {relatedArticles.map((related) => (
              <Link
                key={related.id}
                href={`/help/article/${related.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <i className="ri-file-text-line text-xl text-brand"></i>
                  <div>
                    <p className="font-semibold text-gray-900">{related.title}</p>
                    <p className="text-sm text-gray-600">{categoryTitle(related.category)}</p>
                  </div>
                </div>
                <i className="ri-arrow-right-s-line text-2xl text-gray-400"></i>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
