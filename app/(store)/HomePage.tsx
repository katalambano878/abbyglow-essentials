'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/skeletons/ProductCardSkeleton';
import { isPreorderProduct } from '@/lib/preorder';
import { displayCompareAtPrice } from '@/lib/storefront-pricing';

const FALLBACK_CATEGORIES = [
  { id: 'electronics', name: 'Electronics', slug: 'electronics', image_url: '/images/categories/electronics.png' },
  { id: 'beauty', name: 'Beauty & Skincare', slug: 'beauty', image_url: '/images/categories/beauty.png' },
  { id: 'home-kitchen', name: 'Home & Kitchen', slug: 'home-kitchen', image_url: '/images/categories/home-kitchen.png' },
  { id: 'fashion', name: 'Fashion & Accessories', slug: 'fashion', image_url: '/images/categories/fashion.png' },
  { id: 'fitness', name: 'Fitness & Sports', slug: 'fitness', image_url: '/images/categories/fitness.png' },
];

const TRUST_ITEMS = [
  { icon: 'ri-truck-line', title: 'Delivery in Ghana', text: 'Nationwide delivery' },
  { icon: 'ri-sparkling-2-line', title: 'Curated Quality', text: 'Handpicked essentials' },
  { icon: 'ri-lock-2-line', title: 'Secure Payment', text: 'MoMo & card checkout' },
  { icon: 'ri-customer-service-2-line', title: 'Customer Support', text: 'We are here to help' },
];

export default function HomePage() {
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [newProducts, setNewProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const productSelect = '*, product_variants(*), product_images(*)';

        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select(productSelect)
          .eq('status', 'active')
          .eq('featured', true)
          .order('created_at', { ascending: false })
          .limit(24);

        if (productsError) throw productsError;
        setFeaturedProducts(productsData || []);

        const { data: newestData, error: newestError } = await supabase
          .from('products')
          .select(productSelect)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(8);

        if (newestError) throw newestError;
        setNewProducts(newestData || []);

        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('id, name, slug, image_url, metadata')
          .eq('status', 'active')
          .order('name');

        if (categoriesError) throw categoriesError;

        const activeCategories = categoriesData || [];
        setAllCategories(activeCategories);

        const featuredCategories = activeCategories.filter(
          (cat: any) => cat.metadata?.featured === true
        );
        setCategories(featuredCategories.length > 0 ? featuredCategories : activeCategories);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const mapProduct = (product: any) => {
    const variants = product.product_variants || [];
    const hasVariants = variants.length > 0;
    const minVariantPrice = hasVariants
      ? Math.min(...variants.map((v: any) => v.price || product.price))
      : undefined;
    const totalVariantStock = hasVariants
      ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0)
      : 0;
    const effectiveStock = hasVariants ? totalVariantStock : product.quantity;

    const colorVariants: ColorVariant[] = [];
    const seenColors = new Set<string>();
    for (const v of variants) {
      const colorName = (v as any).option2;
      if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
        const hex = getColorHex(colorName);
        if (hex) {
          seenColors.add(colorName.toLowerCase().trim());
          colorVariants.push({ name: colorName.trim(), hex });
        }
      }
    }

    const categoryMatch = allCategories.find((c) => c.id === product.category_id);

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      originalPrice: displayCompareAtPrice(product.compare_at_price, product.price),
      image: product.product_images?.[0]?.url || '/images/categories/electronics.png',
      rating: product.rating_avg || 5,
      reviewCount: product.review_count || 0,
      badge: undefined as string | undefined,
      inStock: effectiveStock > 0,
      maxStock: effectiveStock || 50,
      moq: product.moq || 1,
      hasVariants,
      minVariantPrice,
      colorVariants,
      category: categoryMatch?.name,
      categorySlug: categoryMatch?.slug,
      isPreorder: isPreorderProduct(product.metadata),
    };
  };

  const displayCategories = (categories.length > 0 ? categories : FALLBACK_CATEGORIES).slice(0, 5);
  const arrivals = (newProducts.length > 0 ? newProducts : featuredProducts).slice(0, 8);

  return (
    <main className="min-h-screen bg-white">
      <section className="relative min-h-[78vh] md:min-h-[86vh] overflow-hidden bg-black">
        <Image
          src="/images/shop-hero.png"
          alt="AbbyGlow Essentials — bath and body essentials"
          fill
          className="object-cover object-center opacity-55"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/20" />

        <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12 h-full min-h-[78vh] md:min-h-[86vh] flex items-center">
          <div className="max-w-2xl py-20">
            <p className="text-brand-accent text-[12px] font-extrabold tracking-[0.28em] uppercase mb-5">
              Fresh. Clean. Glowing.
            </p>
            <h1 className="text-white text-5xl sm:text-6xl lg:text-[4.4rem] font-black leading-[0.95] tracking-tight uppercase">
              Bath & body{' '}
              <span className="text-brand-accent">essentials.</span>
            </h1>
            <p className="mt-6 text-white/75 text-[16px] sm:text-[18px] max-w-lg">
              After-wash products, Olay shower gel, body splashes, skincare soaps, vitamins & glow essentials — Accra with nationwide delivery.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/shop"
                className="inline-flex items-center justify-center bg-brand-accent hover:bg-brand-accentDark text-black font-extrabold tracking-[0.12em] uppercase px-8 py-3.5 text-[13px]"
              >
                Shop now
              </Link>
              <Link
                href="/categories"
                className="inline-flex items-center justify-center border border-white text-white hover:bg-white hover:text-black font-extrabold tracking-[0.12em] uppercase px-8 py-3.5 text-[13px] transition-colors"
              >
                Explore collection
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-black/10 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <i className={`${item.icon} text-2xl text-black`} />
              <div>
                <p className="font-extrabold uppercase tracking-wide text-[12px] text-black">{item.title}</p>
                <p className="text-[12px] text-black/50">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
          <h2 className="text-center text-[26px] sm:text-[32px] font-black uppercase tracking-tight text-black mb-10">
            Shop by category
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {displayCategories.map((category) => (
              <Link
                key={category.id || category.slug}
                href={`/shop?category=${category.slug}`}
                className="group"
              >
                <div className="aspect-[3/4] overflow-hidden relative bg-black rounded-2xl md:rounded-3xl">
                  <Image
                    src={category.image_url || '/images/categories/electronics.png'}
                    alt={category.name}
                    fill
                    className="object-cover opacity-80 transition-transform duration-700 group-hover:scale-105 group-hover:opacity-60"
                    sizes="(max-width: 768px) 50vw, 20vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-0 right-0 text-center px-2">
                    <h3 className="text-white text-[14px] font-black uppercase tracking-[0.12em]">{category.name}</h3>
                    <span className="inline-block mt-1 text-[11px] font-bold uppercase tracking-wide text-brand-accent">
                      Shop now
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white border-t border-black/5">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-8">
          <div className="flex items-end justify-between gap-4 mb-8">
            <h2 className="text-[26px] sm:text-[32px] font-black uppercase tracking-tight text-black">New arrivals</h2>
            <Link href="/shop?sort=new" className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-black inline-flex items-center gap-1 hover:text-black/50">
              View all <i className="ri-arrow-right-line" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3">
              {[...Array(8)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : arrivals.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3">
              {arrivals.map((product) => {
                const mapped = mapProduct(product);
                return (
                  <ProductCard
                    key={product.id}
                    {...mapped}
                    badge="NEW"
                    variant="showcase"
                  />
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-black/20 px-6 py-16 text-center">
              <p className="text-black/50">New arrivals will appear here once products are added.</p>
              <Link href="/shop" className="inline-flex mt-4 font-extrabold uppercase tracking-wide text-black">Browse the shop</Link>
            </div>
          )}
        </div>
      </section>

      <section className="px-4 sm:px-8 pb-16 md:pb-20">
        <div className="max-w-[1400px] mx-auto grid md:grid-cols-2 gap-3">
          <div className="relative min-h-[280px] overflow-hidden rounded-3xl bg-black text-white p-8 md:p-12 flex flex-col justify-end">
            <Image
              src="/images/categories/electronics.png"
              alt=""
              fill
              className="object-cover opacity-35"
              sizes="50vw"
            />
            <div className="relative z-10">
              <p className="text-brand-accent text-[11px] font-extrabold tracking-[0.22em] uppercase mb-3">Shop the range</p>
              <h3 className="text-3xl md:text-4xl font-black uppercase leading-tight">After-wash & shower gel essentials.</h3>
              <Link
                href="/shop"
                className="mt-6 inline-flex rounded-xl bg-brand-accent text-black font-extrabold uppercase tracking-[0.12em] px-6 py-3 text-[12px]"
              >
                Shop now
              </Link>
            </div>
          </div>
          <div className="relative min-h-[280px] overflow-hidden rounded-3xl bg-[#2A2A2A] text-white p-8 md:p-12 flex flex-col justify-end">
            <Image
              src="/images/categories/fashion.png"
              alt=""
              fill
              className="object-cover opacity-30"
              sizes="50vw"
            />
            <div className="relative z-10">
              <p className="text-brand-accent text-[11px] font-extrabold tracking-[0.22em] uppercase mb-3">Limited drop</p>
              <h3 className="text-3xl md:text-4xl font-black uppercase leading-tight">Body splashes, soaps & glow vitamins.</h3>
              <Link
                href="/shop?sort=new"
                className="mt-6 inline-flex rounded-xl border border-white text-white hover:bg-white hover:text-black font-extrabold uppercase tracking-[0.12em] px-6 py-3 text-[12px] transition-colors"
              >
                Explore now
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
