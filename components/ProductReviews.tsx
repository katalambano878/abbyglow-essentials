/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { cachedQuery, invalidateCache } from '@/lib/query-cache';
import { useRecaptcha } from '@/hooks/useRecaptcha';

interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  verified: boolean;
  title: string;
  content: string;
  user_id: string;
}

const HELPFUL_STORAGE_KEY = 'abbyglow_helpful_reviews';

function readHelpful(): string[] {
  try {
    const raw = localStorage.getItem(HELPFUL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeHelpful(ids: string[]) {
  try {
    localStorage.setItem(HELPFUL_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

interface ProductReviewsProps {
  productId: string;
}

export default function ProductReviews({ productId }: ProductReviewsProps) {
  const [filter, setFilter] = useState('all');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [helpfulIds, setHelpfulIds] = useState<string[]>([]);

  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    title: '',
    content: ''
  });
  const { getToken, verifying } = useRecaptcha();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Check auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    setHelpfulIds(readHelpful());
    fetchReviews();
  }, [productId]);

  const toggleHelpful = (reviewId: string) => {
    setHelpfulIds((prev) => {
      const next = prev.includes(reviewId) ? prev.filter((id) => id !== reviewId) : [...prev, reviewId];
      writeHelpful(next);
      return next;
    });
  };

  const fetchReviews = async () => {
    try {
      // Fetch approved reviews (cached for 5 minutes)
      const { data, error } = await cachedQuery<{ data: any; error: any }>(
        `reviews:${productId}`,
        (() => supabase
          .from('reviews')
          .select('*')
          .eq('product_id', productId)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })) as any,
        5 * 60 * 1000
      );

      if (error) throw error;

      if (data) {
        // Reviewer profiles are not readable from the browser, so authors are
        // labelled by purchase verification only.
        const formattedReviews = data.map((r: any) => ({
          id: r.id,
          author: r.verified_purchase ? 'Verified purchase' : 'Customer',
          rating: Number(r.rating) || 0,
          date: r.created_at,
          verified: Boolean(r.verified_purchase),
          title: r.title || '',
          content: r.content || '',
          user_id: r.user_id
        }));
        setReviews(formattedReviews);
      }
    } catch (err) {
      console.error('Error fetching reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const averageRating = reviews.length > 0
    ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
    : 0;

  const ratingDistribution = [5, 4, 3, 2, 1].map(star => {
    const count = reviews.filter(r => r.rating === star).length;
    return {
      star,
      count,
      percentage: reviews.length > 0 ? (count / reviews.length) * 100 : 0
    };
  });

  const filteredReviews = filter === 'all'
    ? reviews
    : reviews.filter(r => r.rating === parseInt(filter));

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (!user) {
      setNotice({ type: 'error', text: 'Please log in to submit a review.' });
      return;
    }

    // reCAPTCHA verification
    const isHuman = await getToken('review');
    if (!isHuman) {
      setNotice({ type: 'error', text: 'Security verification failed. Please try again.' });
      return;
    }

    setIsSubmitting(true);

    try {
      // status is forced to 'pending' and verified_purchase is computed server-side.
      const { error } = await supabase.from('reviews').insert([{
        product_id: productId,
        rating: reviewForm.rating,
        title: reviewForm.title.trim(),
        content: reviewForm.content.trim(),
      }]);

      if (error) throw error;

      setNotice({ type: 'success', text: "Thanks! Your review will appear once it's approved." });
      setShowReviewForm(false);
      setReviewForm({ rating: 5, title: '', content: '' });
      invalidateCache(`reviews:${productId}`);
    } catch (err: any) {
      console.error('Submit review error:', err);
      setNotice({ type: 'error', text: `Failed to submit review: ${err?.message || 'please try again.'}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="py-8 text-center text-gray-500">Loading reviews...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Customer Reviews</h2>

      {notice && (
        <div className={`mb-6 p-4 rounded-lg border text-sm flex items-start gap-2 ${notice.type === 'success' ? 'bg-brand-soft border-brand/30 text-brand-ink' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <i className={`${notice.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} mt-0.5`}></i>
          <span>{notice.text}</span>
        </div>
      )}

      {reviews.length === 0 && !showReviewForm ? (
        <div className="text-center py-8 mb-8 border-b border-gray-200">
          <p className="text-gray-500 mb-4">No reviews yet. Be the first to review!</p>
          <button
            onClick={() => setShowReviewForm(true)}
            className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-lg font-semibold transition-colors"
          >
            Write a Review
          </button>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-8 mb-8 pb-8 border-b border-gray-200">
            <div className="text-center">
              <div className="text-5xl font-bold text-gray-900 mb-2">{averageRating.toFixed(1)}</div>
              <div className="flex items-center justify-center mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <i
                    key={star}
                    className={`ri-star-${star <= Math.round(averageRating) ? 'fill' : 'line'} text-xl ${star <= Math.round(averageRating) ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                  ></i>
                ))}
              </div>
              <p className="text-gray-600">Based on {reviews.length} reviews</p>
            </div>

            <div className="md:col-span-2">
              <div className="space-y-2">
                {ratingDistribution.map((dist) => (
                  <div key={dist.star} className="flex items-center space-x-3">
                    <button
                      onClick={() => setFilter(dist.star.toString())}
                      className="flex items-center space-x-1 hover:text-brand transition-colors"
                    >
                      <span className="text-sm font-medium w-6">{dist.star}</span>
                      <i className="ri-star-fill text-yellow-400 text-sm"></i>
                    </button>
                    <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 transition-all duration-300"
                        style={{ width: `${dist.percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-gray-600 w-8">{dist.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${filter === 'all'
                  ? 'bg-brand text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                All Reviews ({reviews.length})
              </button>
              {/* Simplified filter buttons for brevity */}
            </div>

            {!showReviewForm && (
              <button
                onClick={() => setShowReviewForm(true)}
                className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Write a Review
              </button>
            )}
          </div>
        </>
      )}

      {showReviewForm && (
        <form onSubmit={handleSubmitReview} className="bg-gray-50 rounded-xl p-6 mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Write Your Review</h3>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">Your Rating *</label>
            <div className="flex space-x-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                  className="w-10 h-10 flex items-center justify-center"
                >
                  <i
                    className={`ri-star-${star <= reviewForm.rating ? 'fill' : 'line'} text-3xl ${star <= reviewForm.rating ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                  ></i>
                </button>
              ))}
            </div>
          </div>

          {!user && (
            <div className="mb-4 p-4 bg-amber-50 text-amber-800 rounded-lg">
              You must be logged in to submit a review.{' '}
              <a href="/auth/login" className="underline font-semibold">Log in</a>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">Review Title *</label>
            <input
              type="text"
              value={reviewForm.title}
              onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
              placeholder="Sum up your experience"
              required
              disabled={!user}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">Your Review *</label>
            <textarea
              value={reviewForm.content}
              onChange={(e) => setReviewForm({ ...reviewForm, content: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
              placeholder="Share your experience with this product"
              required
              disabled={!user}
            ></textarea>
          </div>

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={isSubmitting || !user}
              className="bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Review'}
            </button>
            <button
              type="button"
              onClick={() => setShowReviewForm(false)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-6">
        {filteredReviews.map((review) => (
          <div key={review.id} className="pb-6 border-b border-gray-200 last:border-0">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 flex items-center justify-center bg-brand-soft rounded-full text-brand font-bold text-lg">
                  {review.author.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-gray-900">{review.author}</span>
                    {review.verified && (
                      <span className="flex items-center text-xs text-brand bg-brand-soft px-2 py-1 rounded">
                        <i className="ri-checkbox-circle-fill mr-1"></i>
                        Verified purchase
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{new Date(review.date).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <i
                    key={star}
                    className={`ri-star-${star <= review.rating ? 'fill' : 'line'} text-lg ${star <= review.rating ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                  ></i>
                ))}
              </div>
            </div>

            <h4 className="font-semibold text-gray-900 mb-2">{review.title}</h4>
            <p className="text-gray-700 mb-4">{review.content}</p>

            <div className="flex items-center space-x-4 text-sm">
              <button
                type="button"
                onClick={() => toggleHelpful(review.id)}
                aria-pressed={helpfulIds.includes(review.id)}
                className={`flex items-center space-x-1 transition-colors ${helpfulIds.includes(review.id) ? 'text-brand font-semibold' : 'text-gray-600 hover:text-brand'}`}
              >
                <i className={helpfulIds.includes(review.id) ? 'ri-thumb-up-fill' : 'ri-thumb-up-line'}></i>
                <span>{helpfulIds.includes(review.id) ? 'Marked helpful' : 'Helpful'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
