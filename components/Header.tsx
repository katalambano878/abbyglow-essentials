'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import MiniCart from './MiniCart';
import BrandLogo from './BrandLogo';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';

type ShopPreview = {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string;
};

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/shop' },
  { label: 'Categories', href: '/categories' },
  { label: 'About', href: '/about' },
  { label: 'Contact Us', href: '/contact' },
];

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [wishlistCount, setWishlistCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopProducts, setShopProducts] = useState<ShopPreview[]>([]);

  const { cartCount, isCartOpen, setIsCartOpen } = useCart();

  useEffect(() => {
    const updateWishlistCount = () => {
      const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      setWishlistCount(wishlist.length);
    };

    updateWishlistCount();
    window.addEventListener('wishlistUpdated', updateWishlistCount);

    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const loadShopPreview = async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, slug, price, product_images(url, position)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5);

      setShopProducts(
        (data || []).map((p: any) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          price: Number(p.price) || 0,
          image: p.product_images?.[0]?.url || '',
        }))
      );
    };

    loadShopPreview();

    return () => {
      window.removeEventListener('wishlistUpdated', updateWishlistCount);
      subscription.unsubscribe();
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/shop?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <>
      <div className="sticky top-0 z-50">
        <div className="safe-area-top bg-black" />
        <div className="bg-black text-white">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center justify-center md:justify-between gap-x-8 py-2 text-[10px] sm:text-[11px] font-bold tracking-[0.12em] uppercase">
            <span className="hidden md:inline">Electronics, beauty, home & more — curated for you</span>
            <span>Secure checkout · Mobile Money & card</span>
            <div className="hidden md:flex items-center gap-6">
              <Link href="/help" className="hover:text-brand-accent">Help & Support</Link>
              <Link href="/order-tracking" className="hover:text-brand-accent">Track Order</Link>
            </div>
          </div>
        </div>

        <header
          className="relative bg-white border-b border-black/10"
          onMouseLeave={() => setShopOpen(false)}
        >
          <nav aria-label="Main navigation">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
              <div className="h-[4.4rem] grid grid-cols-[auto_1fr_auto] items-center gap-4">
                <div className="flex items-center gap-2">
                  <button
                    className="lg:hidden p-2 -ml-2 text-black"
                    onClick={() => setIsMobileMenuOpen(true)}
                    aria-label="Open menu"
                  >
                    <i className="ri-menu-line text-[22px]" />
                  </button>
                  <BrandLogo />
                </div>

                <div className="hidden lg:flex items-center justify-center gap-8">
                  {NAV_LINKS.map((link) =>
                    link.label === 'Shop' ? (
                      <div key={link.href} className="relative">
                        <Link
                          href={link.href}
                          className={`inline-flex items-center gap-1 text-[12px] font-extrabold uppercase tracking-[0.16em] transition-colors ${
                            shopOpen ? 'text-black' : 'text-black hover:text-black/50'
                          }`}
                          onMouseEnter={() => setShopOpen(true)}
                          aria-expanded={shopOpen}
                          aria-haspopup="true"
                        >
                          {link.label}
                          <i className={`ri-arrow-down-s-line text-base transition-transform ${shopOpen ? 'rotate-180' : ''}`} />
                        </Link>
                      </div>
                    ) : (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-black hover:text-black/50 transition-colors"
                      >
                        {link.label}
                      </Link>
                    )
                  )}
                </div>

                <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                  <button
                    className="p-2 text-black hover:opacity-60"
                    onClick={() => setIsSearchOpen(true)}
                    aria-label="Search"
                  >
                    <i className="ri-search-line text-[20px]" />
                  </button>

                  <Link
                    href={user ? '/account' : '/auth/login'}
                    className="hidden sm:flex p-2 text-black hover:opacity-60"
                    aria-label={user ? 'Account' : 'Login'}
                  >
                    <i className="ri-user-line text-[20px]" />
                  </Link>

                  <Link
                    href="/wishlist"
                    className="hidden sm:flex p-2 text-black hover:opacity-60 relative"
                    aria-label="Wishlist"
                  >
                    <i className="ri-heart-line text-[20px]" />
                    {wishlistCount > 0 && (
                      <span className="absolute top-1 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] font-bold text-white">
                        {wishlistCount}
                      </span>
                    )}
                  </Link>

                  <div className="relative shrink-0">
                    <button
                      className="p-2 text-black hover:opacity-60"
                      onClick={() => setIsCartOpen(!isCartOpen)}
                      aria-label="Cart"
                    >
                      <span className="relative inline-flex">
                        <i className="ri-shopping-bag-line text-[20px]" />
                        <span className="absolute -top-1.5 -right-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-black text-[9px] font-bold text-white px-1">
                          {cartCount}
                        </span>
                      </span>
                    </button>
                    <MiniCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
                  </div>
                </div>
              </div>
            </div>
          </nav>

          {shopOpen && (
            <div className="hidden lg:block absolute left-0 right-0 top-full z-40 border-t border-black/10 bg-white shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)]">
              <div className="max-w-[1400px] mx-auto px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-black/50">Featured in shop</p>
                  <Link href="/shop" className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-black hover:text-black/50">
                    View all →
                  </Link>
                </div>
                {shopProducts.length === 0 ? (
                  <p className="text-sm text-black/40 py-4">Products will appear here once the catalog loads.</p>
                ) : (
                  <div className="grid grid-cols-5 gap-3">
                    {shopProducts.map((product) => (
                      <Link
                        key={product.id}
                        href={`/product/${product.slug}`}
                        className="group"
                        onClick={() => setShopOpen(false)}
                      >
                        <div className="relative aspect-square overflow-hidden rounded-lg bg-[#F3F1EC] mb-1.5">
                          {product.image ? (
                            <Image
                              src={product.image}
                              alt={product.name}
                              fill
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
                              sizes="180px"
                            />
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-[11px] text-black/30">No image</span>
                          )}
                        </div>
                        <p className="text-[12px] font-semibold text-black line-clamp-1 leading-snug group-hover:opacity-70">
                          {product.name}
                        </p>
                        <p className="mt-0.5 text-[11px] font-bold text-black">GH₵{product.price.toFixed(2)}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </header>
      </div>

      {isSearchOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 sm:px-6">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xl"
            onClick={() => setIsSearchOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-3xl bg-white overflow-hidden">
            <form onSubmit={handleSearch} className="relative flex items-center">
              <div className="absolute left-6 text-black/30 pointer-events-none">
                <i className="ri-search-line text-[20px]" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, collections, categories..."
                className="w-full h-[64px] bg-transparent pl-[60px] pr-20 text-[17px] text-black placeholder:text-black/35 focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="absolute right-5 w-8 h-8 flex items-center justify-center text-black/40 hover:text-black"
                aria-label="Close search"
              >
                <i className="ri-close-line text-[20px]" />
              </button>
            </form>
          </div>
        </div>
      )}

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-0 left-0 bottom-0 w-4/5 max-w-xs bg-white flex flex-col">
            <div className="p-4 border-b border-black/10 flex items-center justify-between">
              <BrandLogo compact onClick={() => setIsMobileMenuOpen(false)} />
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 -mr-2 text-black"
                aria-label="Close menu"
              >
                <i className="ri-close-line text-2xl" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {NAV_LINKS.map((link) =>
                link.label === 'Shop' ? (
                  <div key={link.href}>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 text-[13px] font-extrabold uppercase tracking-[0.14em] text-black"
                      onClick={() => setShopOpen((open) => !open)}
                    >
                      Shop
                      <i className={`ri-arrow-down-s-line text-lg transition-transform ${shopOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {shopOpen && (
                      <div className="pb-2 space-y-1">
                        {shopProducts.map((product) => (
                          <Link
                            key={product.id}
                            href={`/product/${product.slug}`}
                            className="flex items-center gap-3 px-4 py-2"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#F3F1EC]">
                              {product.image ? (
                                <Image src={product.image} alt="" fill className="object-cover" sizes="48px" />
                              ) : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[13px] font-semibold text-black line-clamp-2">{product.name}</span>
                              <span className="text-[12px] text-black/50">GH₵{product.price.toFixed(2)}</span>
                            </span>
                          </Link>
                        ))}
                        <Link
                          href="/shop"
                          className="block px-4 py-2 text-[12px] font-extrabold uppercase tracking-wide text-black/60"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          View all products
                        </Link>
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block px-4 py-3 text-[13px] font-extrabold uppercase tracking-[0.14em] text-black hover:bg-black hover:text-brand-accent"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                )
              )}
              <div className="h-px bg-black/10 my-2" />
              {[
                { label: 'Track Order', href: '/order-tracking' },
                { label: 'Wishlist', href: '/wishlist' },
                { label: 'My Account', href: '/account' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-black/60 hover:text-black"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
