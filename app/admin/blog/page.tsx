'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type BlogStatus = 'draft' | 'published' | 'archived';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featured_image: string | null;
  author_id: string | null;
  status: BlogStatus;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

interface PostForm {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featured_image: string;
  status: BlogStatus;
  tags: string;
  seo_title: string;
  seo_description: string;
}

const emptyForm: PostForm = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  featured_image: '',
  status: 'draft',
  tags: '',
  seo_title: '',
  seo_description: '',
};

const toSlug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const statusColors: Record<BlogStatus, string> = {
  published: 'bg-brand-soft text-brand',
  draft: 'bg-gray-100 text-gray-700',
  archived: 'bg-amber-100 text-amber-700',
};
const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function AdminBlogPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | BlogStatus>('all');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'published'>('date');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [form, setForm] = useState<PostForm>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPosts((data || []) as BlogPost[]);
    } catch (err: any) {
      console.error('Error fetching blog posts:', err);
      setNotice({ type: 'error', text: `Could not load posts: ${err?.message || 'unknown error'}` });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingPost(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (post: BlogPost) => {
    setEditingPost(post);
    setForm({
      title: post.title || '',
      slug: post.slug || '',
      excerpt: post.excerpt || '',
      content: post.content || '',
      featured_image: post.featured_image || '',
      status: post.status || 'draft',
      tags: (post.tags || []).join(', '),
      seo_title: post.seo_title || '',
      seo_description: post.seo_description || '',
    });
    setSlugTouched(true);
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving || uploading) return;
    setShowModal(false);
    setEditingPost(null);
  };

  const updateForm = (patch: Partial<PostForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleTitleChange = (title: string) => {
    updateForm(slugTouched ? { title } : { title, slug: toSlug(title) });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    try {
      if (!input.files || input.files.length === 0) return;
      const file = input.files[0];
      const ext = ALLOWED_IMAGE_TYPES[file.type];
      if (!ext) {
        setFormError('Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF.');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setFormError('Image is larger than 10 MB.');
        return;
      }
      setUploading(true);
      setFormError(null);
      const base = toSlug(form.slug || form.title) || 'post';
      const path = `${base}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('blog').upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('blog').getPublicUrl(path);
      updateForm({ featured_image: publicUrl });
    } catch (err: any) {
      setFormError(`Upload failed: ${err?.message || 'unknown error'}`);
    } finally {
      setUploading(false);
      input.value = '';
    }
  };

  const buildPayload = (status: BlogStatus, existing: BlogPost | null) => {
    // Publishing stamps published_at once; moving away from published clears it.
    const publishedAt =
      status === 'published'
        ? existing?.published_at || new Date().toISOString()
        : null;
    return {
      title: form.title.trim(),
      slug: toSlug(form.slug || form.title),
      excerpt: form.excerpt.trim() || null,
      content: form.content,
      featured_image: form.featured_image.trim() || null,
      status,
      published_at: publishedAt,
      seo_title: form.seo_title.trim() || null,
      seo_description: form.seo_description.trim() || null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      updated_at: new Date().toISOString(),
    };
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (!toSlug(form.slug || form.title)) { setFormError('Slug is required.'); return; }
    if (!form.content.trim()) { setFormError('Content is required.'); return; }

    setSaving(true);
    setFormError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('Your session has expired. Sign in again.');

      const payload = buildPayload(form.status, editingPost);

      if (editingPost) {
        const { error } = await supabase.from('blog_posts').update(payload).eq('id', editingPost.id);
        if (error) throw error;
        setNotice({ type: 'success', text: `"${payload.title}" updated.` });
      } else {
        const { error } = await supabase
          .from('blog_posts')
          .insert([{ ...payload, author_id: session.user.id }]);
        if (error) throw error;
        setNotice({ type: 'success', text: `"${payload.title}" created.` });
      }

      setShowModal(false);
      setEditingPost(null);
      await fetchPosts();
    } catch (err: any) {
      const msg = err?.message || 'unknown error';
      setFormError(/unique|duplicate|slug/i.test(msg) ? `That slug is already used by another post (${msg})` : msg);
    } finally {
      setSaving(false);
    }
  };

  const setPostStatus = async (post: BlogPost, status: BlogStatus) => {
    setWorking(post.id);
    setNotice(null);
    try {
      const publishedAt = status === 'published' ? post.published_at || new Date().toISOString() : null;
      const { error } = await supabase
        .from('blog_posts')
        .update({ status, published_at: publishedAt, updated_at: new Date().toISOString() })
        .eq('id', post.id);
      if (error) throw error;
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, status, published_at: publishedAt } : p)));
      setNotice({ type: 'success', text: `"${post.title}" ${status === 'published' ? 'published' : `moved to ${status}`}.` });
    } catch (err: any) {
      setNotice({ type: 'error', text: `Could not update "${post.title}": ${err?.message || 'unknown error'}` });
    } finally {
      setWorking(null);
    }
  };

  const handleDelete = async (post: BlogPost) => {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setWorking(post.id);
    setNotice(null);
    try {
      const { error } = await supabase.from('blog_posts').delete().eq('id', post.id);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setSelectedPosts((prev) => prev.filter((id) => id !== post.id));
      setNotice({ type: 'success', text: `"${post.title}" deleted.` });
    } catch (err: any) {
      setNotice({ type: 'error', text: `Could not delete "${post.title}": ${err?.message || 'unknown error'}` });
    } finally {
      setWorking(null);
    }
  };

  const bulkSetStatus = async (status: BlogStatus) => {
    const targets = posts.filter((p) => selectedPosts.includes(p.id));
    for (const post of targets) {
      await setPostStatus(post, status);
    }
    setSelectedPosts([]);
  };

  const bulkDelete = async () => {
    const targets = posts.filter((p) => selectedPosts.includes(p.id));
    if (targets.length === 0) return;
    if (!confirm(`Delete ${targets.length} post${targets.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    const failed: string[] = [];
    for (const post of targets) {
      const { error } = await supabase.from('blog_posts').delete().eq('id', post.id);
      if (error) failed.push(post.title);
    }
    await fetchPosts();
    setSelectedPosts([]);
    setNotice(failed.length
      ? { type: 'error', text: `Deleted ${targets.length - failed.length}. Failed: ${failed.join(', ')}` }
      : { type: 'success', text: `${targets.length} post${targets.length === 1 ? '' : 's'} deleted.` });
  };

  const filteredPosts = posts
    .filter((p) => statusFilter === 'all' || p.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'published') {
        return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const handleSelectAll = () => {
    if (selectedPosts.length === filteredPosts.length) {
      setSelectedPosts([]);
    } else {
      setSelectedPosts(filteredPosts.map((p) => p.id));
    }
  };

  const handleSelectPost = (postId: string) => {
    setSelectedPosts((prev) => (prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId]));
  };

  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

  const stats = {
    total: posts.length,
    published: posts.filter((p) => p.status === 'published').length,
    drafts: posts.filter((p) => p.status === 'draft').length,
    archived: posts.filter((p) => p.status === 'archived').length,
  };

  const renderActions = (post: BlogPost, compact = false) => (
    <div className={`flex items-center ${compact ? 'space-x-1' : 'space-x-2'}`}>
      <button
        onClick={() => openEdit(post)}
        title="Edit"
        className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-brand hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
      >
        <i className="ri-edit-line text-lg"></i>
      </button>
      {post.status === 'published' ? (
        <>
          <a
            href={`/blog/${post.slug}`}
            target="_blank"
            rel="noreferrer"
            title="View on site"
            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-brand hover:bg-brand-soft rounded-lg transition-colors"
          >
            <i className="ri-external-link-line text-lg"></i>
          </a>
          <button
            onClick={() => setPostStatus(post, 'draft')}
            disabled={working === post.id}
            title="Unpublish"
            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <i className="ri-eye-off-line text-lg"></i>
          </button>
        </>
      ) : (
        <button
          onClick={() => setPostStatus(post, 'published')}
          disabled={working === post.id}
          title="Publish"
          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-brand hover:bg-brand-soft rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          <i className="ri-send-plane-line text-lg"></i>
        </button>
      )}
      <button
        onClick={() => handleDelete(post)}
        disabled={working === post.id}
        title="Delete"
        className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
      >
        <i className={`${working === post.id ? 'ri-loader-4-line animate-spin' : 'ri-delete-bin-line'} text-lg`}></i>
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Blog Posts</h1>
          <p className="text-gray-600 mt-1">Create and manage your blog content</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          <i className="ri-add-line mr-2"></i>
          New Post
        </button>
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
        <button onClick={() => setStatusFilter('all')} className={`bg-white rounded-xl border-2 p-4 text-left cursor-pointer ${statusFilter === 'all' ? 'border-brand' : 'border-gray-200'}`}>
          <p className="text-sm text-gray-600 mb-1">Total Posts</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </button>
        <button onClick={() => setStatusFilter('published')} className={`bg-white rounded-xl border-2 p-4 text-left cursor-pointer ${statusFilter === 'published' ? 'border-brand' : 'border-gray-200'}`}>
          <p className="text-sm text-gray-600 mb-1">Published</p>
          <p className="text-2xl font-bold text-brand">{stats.published}</p>
        </button>
        <button onClick={() => setStatusFilter('draft')} className={`bg-white rounded-xl border-2 p-4 text-left cursor-pointer ${statusFilter === 'draft' ? 'border-brand' : 'border-gray-200'}`}>
          <p className="text-sm text-gray-600 mb-1">Drafts</p>
          <p className="text-2xl font-bold text-gray-900">{stats.drafts}</p>
        </button>
        <button onClick={() => setStatusFilter('archived')} className={`bg-white rounded-xl border-2 p-4 text-left cursor-pointer ${statusFilter === 'archived' ? 'border-brand' : 'border-gray-200'}`}>
          <p className="text-sm text-gray-600 mb-1">Archived</p>
          <p className="text-2xl font-bold text-amber-700">{stats.archived}</p>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand font-medium cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand font-medium cursor-pointer"
              >
                <option value="date">Sort by Created</option>
                <option value="published">Sort by Published</option>
                <option value="title">Sort by Title</option>
              </select>
            </div>
            <div className="flex border-2 border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`w-10 h-10 flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-brand text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                <i className="ri-grid-line text-xl"></i>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`w-10 h-10 flex items-center justify-center border-l-2 border-gray-300 transition-colors ${viewMode === 'list' ? 'bg-brand text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                <i className="ri-list-check text-xl"></i>
              </button>
            </div>
          </div>
        </div>

        {selectedPosts.length > 0 && (
          <div className="p-4 bg-brand-soft border-b border-brand/30 flex items-center justify-between">
            <p className="text-brand font-semibold">
              {selectedPosts.length} post{selectedPosts.length > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center space-x-2">
              <button onClick={() => bulkSetStatus('published')} className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer">
                Publish
              </button>
              <button onClick={() => bulkSetStatus('draft')} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer">
                Draft
              </button>
              <button onClick={bulkDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer">
                Delete
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <i className="ri-loader-4-line animate-spin text-3xl mb-2 inline-block"></i>
            <p>Loading posts...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <i className="ri-article-line text-4xl mb-4 text-gray-300 inline-block"></i>
            <p className="text-lg">No posts yet</p>
            <p className="text-sm text-gray-400 mt-1">Click “New Post” to write your first article.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="p-6 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPosts.map((post) => (
              <div key={post.id} className="border-2 border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={selectedPosts.includes(post.id)}
                    onChange={() => handleSelectPost(post.id)}
                    className="absolute top-3 left-3 w-5 h-5 text-brand border-gray-300 rounded focus:ring-brand cursor-pointer z-10"
                  />
                  <div className="aspect-video bg-gray-100 overflow-hidden flex items-center justify-center">
                    {post.featured_image ? (
                      <img src={post.featured_image} alt={post.title} className="w-full h-full object-cover" />
                    ) : (
                      <i className="ri-image-line text-4xl text-gray-300"></i>
                    )}
                  </div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-brand truncate max-w-[60%]">
                      {(post.tags || []).slice(0, 2).join(', ') || 'No tags'}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColors[post.status] || 'bg-gray-100'}`}>
                      {statusLabel(post.status)}
                    </span>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2 line-clamp-2">{post.title}</h3>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{post.excerpt || post.content.slice(0, 140)}</p>
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-4 pb-4 border-b border-gray-200 mt-auto">
                    <span className="font-mono text-xs truncate">/blog/{post.slug}</span>
                    <span className="whitespace-nowrap">{formatDate(post.published_at || post.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => openEdit(post)}
                      className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded-lg text-sm font-medium text-center transition-colors whitespace-nowrap cursor-pointer mr-2"
                    >
                      Edit Post
                    </button>
                    {renderActions(post, true)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-4 px-6">
                    <input
                      type="checkbox"
                      checked={selectedPosts.length === filteredPosts.length && filteredPosts.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand cursor-pointer"
                    />
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Post</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Tags</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Published</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPosts.map((post) => (
                  <tr key={post.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedPosts.includes(post.id)}
                        onChange={() => handleSelectPost(post.id)}
                        className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-20 h-14 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                          {post.featured_image ? (
                            <img src={post.featured_image} alt={post.title} className="w-full h-full object-cover" />
                          ) : (
                            <i className="ri-image-line text-2xl text-gray-300"></i>
                          )}
                        </div>
                        <div className="min-w-0">
                          <button onClick={() => openEdit(post)} className="font-semibold text-gray-900 hover:text-brand text-left cursor-pointer">
                            {post.title}
                          </button>
                          <p className="text-sm text-gray-500 mt-1 font-mono truncate">/blog/{post.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700 text-sm">{(post.tags || []).join(', ') || '—'}</td>
                    <td className="py-4 px-4 text-gray-700 text-sm whitespace-nowrap">{formatDate(post.published_at)}</td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[post.status] || 'bg-gray-100'}`}>
                        {statusLabel(post.status)}
                      </span>
                    </td>
                    <td className="py-4 px-4">{renderActions(post)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-6 border-t border-gray-200 flex items-center justify-between">
          <p className="text-gray-600">Showing {filteredPosts.length} of {posts.length} posts</p>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-bold text-gray-900">{editingPost ? 'Edit Post' : 'New Post'}</h2>
              <button
                onClick={closeModal}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{formError}</div>
              )}

              <div className="grid md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="Post title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Slug *</label>
                  <div className="flex items-center">
                    <span className="text-gray-500 bg-gray-100 px-3 py-3 border-2 border-r-0 border-gray-300 rounded-l-lg text-sm">/blog/</span>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) => { setSlugTouched(true); updateForm({ slug: toSlug(e.target.value) }); }}
                      className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-r-lg focus:ring-2 focus:ring-brand focus:border-brand font-mono text-sm"
                      placeholder="post-slug"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => updateForm({ status: e.target.value as BlogStatus })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand cursor-pointer"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Excerpt</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={form.excerpt}
                  onChange={(e) => updateForm({ excerpt: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand resize-none"
                  placeholder="Short summary shown in listings"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Content *</label>
                <textarea
                  rows={12}
                  value={form.content}
                  onChange={(e) => updateForm({ content: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand font-mono text-sm"
                  placeholder="Write the article (Markdown or HTML)"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Featured image</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="url"
                    value={form.featured_image}
                    onChange={(e) => updateForm({ featured_image: e.target.value })}
                    className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand text-sm"
                    placeholder="https://… or upload"
                  />
                  <label className={`px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:border-brand hover:text-brand cursor-pointer flex items-center justify-center whitespace-nowrap ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <i className={`${uploading ? 'ri-loader-4-line animate-spin' : 'ri-upload-2-line'} mr-2`}></i>
                    {uploading ? 'Uploading…' : 'Upload'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={uploading}
                    />
                  </label>
                </div>
                {form.featured_image && (
                  <div className="mt-3 h-40 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                    <img src={form.featured_image} alt="Featured" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Tags</label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => updateForm({ tags: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="skincare, tips, routine"
                />
                <p className="text-xs text-gray-500 mt-1">Separate tags with commas</p>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">SEO title</label>
                  <input
                    type="text"
                    value={form.seo_title}
                    onChange={(e) => updateForm({ seo_title: e.target.value })}
                    maxLength={120}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="Defaults to the title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">SEO description</label>
                  <input
                    type="text"
                    value={form.seo_description}
                    onChange={(e) => updateForm({ seo_description: e.target.value })}
                    maxLength={200}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="Defaults to the excerpt"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end space-x-3 bg-gray-50 rounded-b-2xl sticky bottom-0">
              <button
                onClick={closeModal}
                disabled={saving || uploading}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || uploading}
                className="px-6 py-3 bg-brand hover:bg-brand-dark text-white rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center disabled:opacity-70"
              >
                {saving && <i className="ri-loader-4-line animate-spin mr-2"></i>}
                {editingPost ? 'Save Changes' : form.status === 'published' ? 'Publish Post' : 'Save Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
