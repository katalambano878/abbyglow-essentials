'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import PageHero from '@/components/PageHero';
import { useWishlist } from '@/context/WishlistContext';
import ProductCard from '@/components/ProductCard';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/lib/supabase';
import { isPreorderProduct } from '@/lib/preorder';

const PLACEHOLDER = '/images/placeholder-product.svg';

export default function WishlistPage() {
  usePageTitle('Wishlist');
  const { wishlist: wishlistItems, removeFromWishlist } = useWishlist();
  const { addToCart, setIsCartOpen } = useCart();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [shareNotice, setShareNotice] = useState('');

  const addAllToCart = async () => {
    if (wishlistItems.length === 0) return;
    setAdding(true);
    setNotice(null);
    try {
      const ids = wishlistItems.map((i) => i.id);
      const { data, error } = await supabase
        .from('products')
        .select('id, name, slug, price, quantity, status, metadata, product_images(url)')
        .in('id', ids);
      if (error) throw error;

      const byId = new Map<string, any>((data || []).map((p: any) => [p.id, p]));
      let added = 0;
      const skipped: string[] = [];
      for (const item of wishlistItems) {
        const product = byId.get(item.id);
        if (!product || product.status !== 'active') {
          skipped.push(item.name);
          continue;
        }
        const preorder = isPreorderProduct(product.metadata);
        const stock = Number(product.quantity) || 0;
        if (!preorder && stock <= 0) {
          skipped.push(product.name);
          continue;
        }
        addToCart({
          id: product.id,
          name: product.name,
          price: Number(product.price) || 0,
          image: product.product_images?.[0]?.url || item.image || PLACEHOLDER,
          quantity: 1,
          slug: product.slug || item.slug || item.id,
          maxStock: preorder ? 999 : stock,
          isPreorder: preorder,
        });
        added += 1;
      }
      if (added === 0) {
        setNotice({ type: 'error', text: 'None of your saved items are available right now.' });
        return;
      }
      setIsCartOpen(true);
      setNotice({
        type: 'success',
        text:
          skipped.length > 0
            ? `Added ${added} item${added === 1 ? '' : 's'} to your cart. Unavailable: ${skipped.join(', ')}.`
            : `Added ${added} item${added === 1 ? '' : 's'} to your cart.`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Could not add your items right now.' });
    } finally {
      setAdding(false);
    }
  };

  const buildShareText = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const lines = wishlistItems.map(
      (item) => `• ${item.name} — ${origin}/product/${item.slug || item.id}`
    );
    return `My AbbyGlow wishlist:\n${lines.join('\n')}`;
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildShareText())}`, '_blank', 'noopener');
  };

  const copyShareText = async () => {
    try {
      await navigator.clipboard.writeText(buildShareText());
      setShareNotice('Wishlist copied — paste it anywhere.');
    } catch {
      setShareNotice('Could not copy automatically. Select the items above and copy them manually.');
    }
    setTimeout(() => setShareNotice(''), 3000);
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <PageHero title="Wishlist" backgroundImage="/wishlist-hero.png" />

      <section className="py-8 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <nav className="flex items-center space-x-2 text-sm mb-2">
                <Link href="/" className="text-gray-600 hover:text-brand transition-colors">Home</Link>
                <i className="ri-arrow-right-s-line text-gray-400"></i>
                <span className="text-gray-900 font-medium">Wishlist</span>
              </nav>
              <p className="text-gray-600">
                {wishlistItems.length} {wishlistItems.length === 1 ? 'item' : 'items'} saved
              </p>
            </div>
            {wishlistItems.length > 0 && (
              <button
                onClick={addAllToCart}
                disabled={adding}
                className="bg-brand-accent hover:bg-brand-accentDark text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add All to Cart'}
              </button>
            )}
          </div>
          {notice && (
            <div
              className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 ${notice.type === 'success' ? 'bg-brand-soft text-brand border border-brand/20' : 'bg-red-50 text-red-700 border border-red-100'}`}
              role="status"
            >
              <i className={`${notice.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} mt-0.5`}></i>
              <span>{notice.text}</span>
            </div>
          )}
        </div>
      </section>

      {wishlistItems.length === 0 ? (
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
            <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 bg-gray-200 rounded-full">
              <i className="ri-heart-line text-5xl text-gray-400"></i>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Your wishlist is empty</h2>
            <p className="text-gray-600 mb-8 text-lg">Save your favourite items here to easily find them later</p>
            <Link href="/shop" className="inline-block bg-brand-accent hover:bg-brand-accentDark text-white px-8 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap">
              Explore Products
            </Link>
          </div>
        </section>
      ) : (
        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {wishlistItems.map((product) => (
                <div key={product.id} className="relative">
                  <ProductCard {...product} slug={product.slug || product.id} />
                  <button
                    onClick={() => removeFromWishlist(product.id)}
                    className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-md hover:bg-red-50 transition-colors z-10"
                  >
                    <i className="ri-close-line text-gray-700 text-xl"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-24 relative bg-gray-50 overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="relative bg-white p-12 sm:p-20 rounded-[3rem] border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.03)] text-center overflow-hidden group transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)]">

            {/* Ambient Subtle Lighting */}
            <div className="absolute -top-32 -right-32 w-96 h-96 bg-brand-soft/80 rounded-full blur-[100px] pointer-events-none group-hover:bg-brand-soft/60 transition-colors duration-1000"></div>
            <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-gray-50 rounded-full blur-[100px] pointer-events-none group-hover:bg-brand-soft/50 transition-colors duration-1000"></div>

            {/* Inner Content */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 bg-gradient-to-br from-gray-50 to-white rounded-2xl flex items-center justify-center mb-8 border border-gray-100 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)] group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500">
                <i className="ri-share-forward-line text-2xl text-gray-700 group-hover:text-black transition-colors duration-500"></i>
              </div>

              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-900 mb-4 tracking-tight drop-shadow-sm">Share Your Wishlist</h2>
              <p className="text-gray-500 mb-12 text-lg sm:text-xl font-light max-w-lg mx-auto leading-relaxed">Let friends and family know exactly what you love.</p>

              {wishlistItems.length === 0 ? (
                <p className="text-sm text-gray-400">Save a few products first, then share them from here.</p>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-4 sm:gap-6">
                    <button
                      onClick={shareWhatsApp}
                      aria-label="Share on WhatsApp"
                      className="group/btn relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-900 hover:border-gray-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 active:scale-95"
                    >
                      <i className="ri-whatsapp-fill text-xl sm:text-2xl transition-transform duration-300 group-hover/btn:scale-110"></i>
                      <div className="absolute inset-0 rounded-full bg-gray-50 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 -z-10"></div>
                    </button>
                    <button
                      onClick={copyShareText}
                      aria-label="Copy wishlist"
                      className="group/btn relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-900 hover:border-gray-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 active:scale-95"
                    >
                      <i className="ri-file-copy-line text-xl sm:text-2xl transition-transform duration-300 group-hover/btn:scale-110"></i>
                      <div className="absolute inset-0 rounded-full bg-gray-50 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 -z-10"></div>
                    </button>
                  </div>
                  {shareNotice && <p className="mt-6 text-sm text-gray-500" role="status">{shareNotice}</p>}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
