/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type ReviewStatus = 'pending' | 'approved' | 'rejected';

export default function AdminReviewsPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');
  const [selectedReviews, setSelectedReviews] = useState<string[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'date' | 'rating' | 'helpful'>('date');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [updating, setUpdating] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          profiles:user_id (full_name, email),
          products:product_id (name, product_images (url))
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error fetching reviews:', error);
        setNotice({ type: 'error', text: `Could not load reviews: ${error.message}` });
      } else if (data) {
        const formatted = data.map((r: any) => ({
          id: r.id,
          customer: {
            name: r.profiles?.full_name || 'Anonymous',
            email: r.profiles?.email || 'N/A',
            avatar: getInitials(r.profiles?.full_name || r.profiles?.email)
          },
          product: {
            name: r.products?.name || 'Unknown Product',
            image: r.products?.product_images?.[0]?.url || '/images/placeholder-product.svg'
          },
          rating: Number(r.rating) || 0,
          title: r.title,
          comment: r.content,
          date: new Date(r.created_at).toLocaleDateString(),
          createdAt: new Date(r.created_at).getTime(),
          status: (String(r.status || 'pending').toLowerCase()) as ReviewStatus,
          verified: Boolean(r.verified_purchase),
          helpful: Number(r.helpful_votes) || 0
        }));
        setReviews(formatted);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    return name
      .replace(/[^a-zA-Z ]/g, '')
      .split(' ')
      .map(n => n?.[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '??';
  };

  const filteredReviews = reviews
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating || b.createdAt - a.createdAt;
      if (sortBy === 'helpful') return b.helpful - a.helpful || b.createdAt - a.createdAt;
      return b.createdAt - a.createdAt;
    });

  const stats = {
    total: reviews.length,
    pending: reviews.filter(r => r.status === 'pending').length,
    approved: reviews.filter(r => r.status === 'approved').length,
    rejected: reviews.filter(r => r.status === 'rejected').length
  };

  const statusColors: Record<ReviewStatus, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-brand-soft text-brand',
    rejected: 'bg-red-100 text-red-700'
  };
  const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const handleSelectAll = () => {
    if (selectedReviews.length === filteredReviews.length) {
      setSelectedReviews([]);
    } else {
      setSelectedReviews(filteredReviews.map(r => r.id));
    }
  };

  const handleSelectReview = (reviewId: string) => {
    if (selectedReviews.includes(reviewId)) {
      setSelectedReviews(selectedReviews.filter(id => id !== reviewId));
    } else {
      setSelectedReviews([...selectedReviews, reviewId]);
    }
  };

  const setReviewStatus = async (ids: string[], newStatus: ReviewStatus) => {
    if (ids.length === 0) return;
    setUpdating(true);
    setNotice(null);
    try {
      const { error } = await supabase
        .from('reviews')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .in('id', ids);

      if (error) throw error;
      await fetchReviews();
      setSelectedReviews([]);
      setNotice({ type: 'success', text: `${ids.length} review${ids.length === 1 ? '' : 's'} marked ${newStatus}.` });
    } catch (err: any) {
      console.error('Error updating reviews', err);
      setNotice({ type: 'error', text: `Failed to update reviews: ${err?.message || 'unknown error'}` });
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkAction = (action: 'Approve' | 'Reject') => {
    setReviewStatus(selectedReviews, action === 'Approve' ? 'approved' : 'rejected');
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <i
            key={star}
            className={`${star <= rating ? 'ri-star-fill text-amber-500' : 'ri-star-line text-gray-300'} text-lg`}
          ></i>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reviews</h1>
          <p className="text-gray-600 mt-1">Moderate and manage customer reviews</p>
        </div>
      </div>

      {notice && (
        <div className={`rounded-lg p-4 text-sm flex items-start justify-between gap-4 border ${notice.type === 'success' ? 'bg-brand-soft text-brand border-brand/30' : 'bg-red-50 text-red-700 border-red-200'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 cursor-pointer" aria-label="Dismiss">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter('all')}
          className={`p-4 rounded-xl border-2 transition-all text-left ${statusFilter === 'all' ? 'border-brand bg-brand-soft' : 'border-gray-200 bg-white'
            }`}
        >
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-600 mt-1">Total Reviews</p>
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`p-4 rounded-xl border-2 transition-all text-left ${statusFilter === 'pending' ? 'border-amber-700 bg-amber-50' : 'border-gray-200 bg-white'
            }`}
        >
          <p className="text-2xl font-bold text-amber-700">{stats.pending}</p>
          <p className="text-sm text-gray-600 mt-1">Pending Review</p>
        </button>
        <button
          onClick={() => setStatusFilter('approved')}
          className={`p-4 rounded-xl border-2 transition-all text-left ${statusFilter === 'approved' ? 'border-brand bg-brand-soft' : 'border-gray-200 bg-white'
            }`}
        >
          <p className="text-2xl font-bold text-brand">{stats.approved}</p>
          <p className="text-sm text-gray-600 mt-1">Approved</p>
        </button>
        <button
          onClick={() => setStatusFilter('rejected')}
          className={`p-4 rounded-xl border-2 transition-all text-left ${statusFilter === 'rejected' ? 'border-red-700 bg-red-50' : 'border-gray-200 bg-white'
            }`}
        >
          <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
          <p className="text-sm text-gray-600 mt-1">Rejected</p>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 text-transform capitalize">
              {statusFilter === 'all' ? 'All Reviews' : `${statusFilter} Reviews`}
            </h2>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand font-medium cursor-pointer"
            >
              <option value="date">Sort by Date</option>
              <option value="rating">Sort by Rating</option>
              <option value="helpful">Sort by Helpful</option>
            </select>
          </div>
        </div>

        {selectedReviews.length > 0 && (
          <div className="p-4 bg-brand-soft border-b border-brand/30 flex items-center justify-between">
            <p className="text-brand font-semibold">
              {selectedReviews.length} review{selectedReviews.length > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleBulkAction('Approve')}
                disabled={updating}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <i className="ri-check-line mr-2"></i>
                Approve
              </button>
              <button
                onClick={() => handleBulkAction('Reject')}
                disabled={updating}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <i className="ri-close-line mr-2"></i>
                Reject
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-4 px-6">
                  <input
                    type="checkbox"
                    checked={selectedReviews.length === filteredReviews.length && filteredReviews.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand cursor-pointer"
                  />
                </th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700 w-1/4">Product</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700 w-1/4">Customer</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700 w-1/3">Review</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Date</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Helpful</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">Loading reviews...</td></tr>
              ) : filteredReviews.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">No reviews found in this category.</td></tr>
              ) : (
                filteredReviews.map((review) => (
                  <tr key={review.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedReviews.includes(review.id)}
                        onChange={() => handleSelectReview(review.id)}
                        className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <img
                          src={review.product.image}
                          alt={review.product.name}
                          className="w-12 h-12 rounded-lg object-cover border border-gray-100"
                        />
                        <span className="text-sm font-medium text-gray-900 line-clamp-2">{review.product.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 flex items-center justify-center bg-brand-soft text-brand rounded-full text-xs font-semibold">
                          {review.customer.avatar}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{review.customer.name}</p>
                          <p className="text-xs text-gray-500">{review.customer.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        {renderStars(review.rating)}
                        <p className="text-sm font-bold text-gray-900">{review.title}</p>
                        <p className="text-sm text-gray-600 line-clamp-2">{review.comment}</p>
                        {review.verified && (
                          <span className="inline-flex items-center text-[11px] font-semibold text-brand">
                            <i className="ri-verified-badge-line mr-1"></i>Verified purchase
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{review.date}</td>
                    <td className="py-4 px-4 text-sm text-gray-700 whitespace-nowrap">
                      <i className="ri-thumb-up-line mr-1 text-gray-400"></i>{review.helpful}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[review.status as ReviewStatus] || 'bg-gray-100'}`}>
                          {statusLabel(review.status)}
                        </span>
                        {review.status !== 'approved' && (
                          <button
                            onClick={() => setReviewStatus([review.id], 'approved')}
                            disabled={updating}
                            title="Approve"
                            className="w-7 h-7 flex items-center justify-center text-brand hover:bg-brand-soft rounded cursor-pointer disabled:opacity-50"
                          >
                            <i className="ri-check-line"></i>
                          </button>
                        )}
                        {review.status !== 'rejected' && (
                          <button
                            onClick={() => setReviewStatus([review.id], 'rejected')}
                            disabled={updating}
                            title="Reject"
                            className="w-7 h-7 flex items-center justify-center text-red-600 hover:bg-red-50 rounded cursor-pointer disabled:opacity-50"
                          >
                            <i className="ri-close-line"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-gray-200">
          <p className="text-gray-600 text-sm">Showing {filteredReviews.length} reviews</p>
        </div>
      </div>
    </div>
  );
}
