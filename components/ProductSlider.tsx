'use client';

import { useState } from 'react';
import ProductCard, { type ColorVariant } from '@/components/ProductCard';

export interface SliderProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating?: number;
  reviewCount?: number;
  badge?: string;
  inStock?: boolean;
  maxStock?: number;
  moq?: number;
  hasVariants?: boolean;
  minVariantPrice?: number;
  colorVariants?: ColorVariant[];
  category?: string;
  categorySlug?: string;
  isPreorder?: boolean;
}

interface ProductSliderProps {
  products: SliderProduct[];
  /** Seconds each product takes to cross the viewport — lower is faster */
  secondsPerItem?: number;
  fadeColor?: 'white' | 'stone-50';
}

export default function ProductSlider({
  products,
  secondsPerItem = 5,
  fadeColor = 'white',
}: ProductSliderProps) {
  const [isPaused, setIsPaused] = useState(false);

  const fadeFrom = fadeColor === 'stone-50' ? 'from-stone-50' : 'from-white';

  if (products.length === 0) return null;

  // Static grid when there aren't enough products to be worth scrolling
  if (products.length < 5) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
        {products.map((product) => (
          <ProductCard key={product.id} {...product} />
        ))}
      </div>
    );
  }

  // The track holds two copies of the list; animating it from 0 to -50%
  // then looping gives a seamless, continuous flow.
  const duration = products.length * secondsPerItem;

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r ${fadeFrom} to-transparent sm:w-12`} />
      <div className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l ${fadeFrom} to-transparent sm:w-12`} />

      <div className="overflow-hidden">
        <div
          className="flex w-max animate-product-marquee"
          style={{
            animationDuration: `${duration}s`,
            animationPlayState: isPaused ? 'paused' : 'running',
          }}
        >
          {[0, 1].map((copy) => (
            <div key={copy} className="flex" aria-hidden={copy === 1}>
              {products.map((product) => (
                <div
                  key={`${copy}-${product.id}`}
                  className="w-44 flex-shrink-0 px-2 sm:w-56 sm:px-3 md:w-64 lg:w-72"
                >
                  <ProductCard {...product} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
