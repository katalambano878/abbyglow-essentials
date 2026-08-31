'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import PageHero from '@/components/PageHero';
import { useWishlist } from '@/context/WishlistContext';
import ProductCard from '@/components/ProductCard';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function WishlistPage() {
  usePageTitle('Wishlist');
  const { wishlist: wishlistItems, removeFromWishlist } = useWishlist();
  const { addToCart } = useCart();

  const addAllToCart = () => {
    const inStockItems = wishlistItems.filter(item => item.inStock);
    inStockItems.forEach(item => {
      // Convert WishlistItem to CartItem if necessary, or assume compatibility
      addToCart({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image,
        quantity: 1,
        slug: item.slug || item.id, // Fallback
        maxStock: 99 // Default
      });
    });
    if (inStockItems.length > 0) {
      alert(`Added ${inStockItems.length} items to cart`);
    }
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
                className="bg-brand-accent hover:bg-brand-accentDark text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Add All to Cart
              </button>
            )}
          </div>
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

              <div className="flex items-center justify-center gap-4 sm:gap-6">
                {[
                  { icon: 'ri-facebook-fill' },
                  { icon: 'ri-twitter-x-fill' },
                  { icon: 'ri-whatsapp-fill' },
                  { icon: 'ri-mail-fill' },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    className="group/btn relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-900 hover:border-gray-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 active:scale-95"
                  >
                    <i className={`${item.icon} text-xl sm:text-2xl transition-transform duration-300 group-hover/btn:scale-110`}></i>
                    <div className="absolute inset-0 rounded-full bg-gray-50 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 -z-10"></div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
