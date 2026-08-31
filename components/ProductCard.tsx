'use client';

import { useState } from 'react';
import Link from 'next/link';
import LazyImage from './LazyImage';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { displayDiscountPercent } from '@/lib/storefront-pricing';

// Map common color names to hex values for swatches
const COLOR_MAP: Record<string, string> = {
  black: '#000000', white: '#FFFFFF', red: '#EF4444', blue: '#3B82F6',
  navy: '#1E3A5F', green: '#22C55E', yellow: '#EAB308', orange: '#F97316',
  pink: '#EC4899', purple: '#A855F7', brown: '#92400E', beige: '#D4C5A9',
  grey: '#6B7280', gray: '#6B7280', cream: '#FFFDD0', teal: '#14B8A6',
  maroon: '#800000', coral: '#FF7F50', burgundy: '#800020', olive: '#808000',
  tan: '#D2B48C', khaki: '#C3B091', charcoal: '#36454F', ivory: '#FFFFF0',
  gold: '#FFD700', silver: '#C0C0C0', rose: '#FF007F', lavender: '#E6E6FA',
  mint: '#98FB98', peach: '#FFDAB9', wine: '#722F37', denim: '#1560BD',
  nude: '#E3BC9A', camel: '#C19A6B', sage: '#BCB88A', rust: '#B7410E',
  mustard: '#FFDB58', plum: '#8E4585', lilac: '#C8A2C8', stone: '#928E85',
  sand: '#C2B280', taupe: '#483C32', mauve: '#E0B0FF', sky: '#87CEEB',
  forest: '#228B22', cobalt: '#0047AB', emerald: '#50C878', scarlet: '#FF2400',
  aqua: '#00FFFF', turquoise: '#40E0D0', indigo: '#4B0082', crimson: '#DC143C',
  magenta: '#FF00FF', cyan: '#00FFFF', chocolate: '#7B3F00', coffee: '#6F4E37',
};

export function getColorHex(colorName: string): string | null {
  const lower = colorName.toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  for (const [key, val] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export interface ColorVariant {
  name: string;
  hex: string;
}

interface ProductCardProps {
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
  /** Tighter typography/badges for dense grids (e.g. 4-up on mobile) */
  compact?: boolean;
  /** Best-sellers showcase layout (matches homepage design) */
  variant?: 'default' | 'showcase';
  /** Pre-order item (AbbyGlow Essentials default) */
  isPreorder?: boolean;
}

export default function ProductCard({
  id,
  slug,
  name,
  price,
  originalPrice,
  image,
  rating = 5,
  reviewCount = 0,
  badge,
  inStock = true,
  maxStock = 50,
  moq = 1,
  hasVariants = false,
  minVariantPrice,
  colorVariants = [],
  category,
  compact = false,
  variant = 'default',
  isPreorder = false,
}: ProductCardProps) {
  const { addToCart } = useCart();
  const { addToWishlist } = useWishlist();
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const displayPrice = hasVariants && minVariantPrice ? minVariantPrice : price;
  const discount = displayDiscountPercent(originalPrice, displayPrice);
  const MAX_SWATCHES = 5;
  const formatPrice = (val: number) => `GH\u20B5${val.toFixed(2)}`;
  const ratingDisplay = Number(rating || 0).toFixed(1);

  if (variant === 'showcase') {
    return (
      <div className="group relative z-0 flex flex-col h-full">
        <div className="relative z-0 aspect-[5/6] rounded-xl overflow-hidden bg-[#F3F1EC] mb-2">
          <Link href={`/product/${slug}`} className="absolute inset-0 block">
            <LazyImage
              src={image}
              alt={name}
              className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
            />
          </Link>

          {(badge || isPreorder || discount > 0) && (
            <div className="absolute top-3 left-3 z-[1]">
              <span className="inline-flex items-center bg-brand-accent text-black text-[11px] font-extrabold tracking-wide px-3 py-1">
                {badge || (isPreorder ? 'PRE-ORDER' : `${discount}% OFF`)}
              </span>
            </div>
          )}

          {/* Vertical action icons */}
          <div className="absolute top-3 right-3 z-[1] flex flex-col gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300">
            <button
              type="button"
              aria-label="Add to wishlist"
              onClick={(e) => {
                e.preventDefault();
                addToWishlist({
                  id,
                  name,
                  price: displayPrice,
                  originalPrice,
                  image,
                  rating,
                  reviewCount,
                  badge,
                  inStock,
                  slug,
                });
              }}
              className="w-9 h-9 rounded-full bg-white/95 shadow-md flex items-center justify-center text-brand hover:bg-white transition"
            >
              <i className="ri-heart-line text-base" />
            </button>
            {!hasVariants && inStock && (
              <button
                type="button"
                aria-label="Add to cart"
                onClick={(e) => {
                  e.preventDefault();
                  addToCart({ id, name, price, image, quantity: moq, slug, maxStock, moq, isPreorder });
                }}
                className="w-9 h-9 rounded-full bg-white/95 shadow-md flex items-center justify-center text-brand hover:bg-white transition"
              >
                <i className="ri-shopping-bag-3-line text-base" />
              </button>
            )}
          </div>

          {!inStock && (
            <div className="absolute inset-0 bg-white/45 backdrop-blur-[1px] z-10 flex items-center justify-center">
              <span className="bg-brand-ink/85 text-white text-xs px-3 py-1.5 rounded-full">Out of Stock</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[12px] text-stone-400 font-medium truncate">
            {category || 'AbbyGlow Essentials'}
          </span>
          <span className="inline-flex items-center gap-1 text-[12px] text-stone-600 shrink-0">
            <i className="ri-star-fill text-amber-400 text-[13px]" />
            {ratingDisplay}
          </span>
        </div>

        <Link href={`/product/${slug}`}>
          <h3 className="text-[13px] sm:text-[14px] font-semibold text-brand-ink leading-snug line-clamp-2 mb-1.5 hover:text-brand transition-colors">
            {name}
          </h3>
        </Link>

        <div className="flex items-baseline gap-2 mt-auto">
          <span className="text-[15px] font-semibold text-brand-accent">
            {hasVariants && minVariantPrice ? `From ${formatPrice(minVariantPrice)}` : formatPrice(price)}
          </span>
          {discount > 0 && originalPrice != null && (
            <span className="text-[13px] text-stone-400 line-through">{formatPrice(originalPrice)}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative z-0 flex flex-col h-full bg-transparent transition-all duration-300 isolate">
      <Link href={`/product/${slug}`} className={`relative z-0 block aspect-[4/5] overflow-hidden bg-[#F4F4F4] ${compact ? 'rounded-lg sm:rounded-2xl mb-2 sm:mb-4' : 'rounded-2xl mb-4'}`}>
        <LazyImage
          src={image}
          alt={name}
          className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
        />

        {(isPreorder || discount > 0) && (
          <div className={`absolute z-[1] ${compact ? 'top-1.5 left-1.5 sm:top-3 sm:left-3' : 'top-3 left-3'}`}>
            <span className={`bg-brand-accent text-black uppercase tracking-wider font-bold ${compact ? 'text-[7px] px-1.5 py-0.5 sm:text-[10px] sm:px-3 sm:py-1' : 'text-[10px] px-3 py-1'}`}>
              {isPreorder ? 'Pre-order' : `-${discount}%`}
            </span>
          </div>
        )}

        {!inStock && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] flex items-center justify-center z-[1]">
            <span className={`bg-black/80 text-white rounded-full font-medium tracking-wide shadow-lg ${compact ? 'px-2 py-1 text-[9px] sm:px-4 sm:py-2 sm:text-sm' : 'px-4 py-2 text-sm'}`}>
              Out of Stock
            </span>
          </div>
        )}

        {inStock && (
          <div className={`absolute bottom-3 left-3 right-3 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-300 lg:translate-y-2 lg:group-hover:translate-y-0 z-[1] ${compact ? 'hidden sm:block' : ''}`}>
            {hasVariants ? (
              <span className="w-full bg-brand-accent text-black hover:bg-brand-accentDark py-3 text-[13px] font-semibold flex items-center justify-center space-x-2 transition-colors">
                <span>Configure</span>
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  addToCart({ id, name, price, image, quantity: moq, slug, maxStock, moq, isPreorder });
                }}
                className="w-full bg-brand-accent text-black hover:bg-brand-accentDark py-3 text-[13px] font-semibold flex items-center justify-center space-x-2 transition-colors"
              >
                <i className="ri-shopping-cart-2-line text-base"></i>
                <span>{moq > 1 ? `Add ${moq}` : 'Quick Add'}</span>
              </button>
            )}
          </div>
        )}
      </Link>

      <div className="flex flex-col flex-grow text-left">
        <Link href={`/product/${slug}`}>
          <h3 className={`font-serif leading-snug text-brand-ink hover:text-brand transition-colors line-clamp-2 ${compact ? 'text-[11px] mb-0.5 sm:text-[17px] sm:mb-1.5' : 'text-[17px] mb-1.5'}`}>
            {name}
          </h3>
        </Link>

        {colorVariants.length > 0 && (
          <div className={`items-center gap-1.5 mb-2 mt-0.5 ${compact ? 'hidden sm:flex' : 'flex'}`}>
            {colorVariants.slice(0, MAX_SWATCHES).map((color) => (
              <button
                key={color.name}
                title={color.name}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveColor(activeColor === color.name ? null : color.name);
                }}
                className={`w-4 h-4 rounded-full border transition-all duration-300 flex-shrink-0 relative ${activeColor === color.name
                    ? 'ring-1 ring-offset-2 ring-gray-900 scale-110'
                    : 'hover:scale-110 ring-1 ring-transparent hover:ring-gray-300 hover:ring-offset-1'
                  } ${color.hex === '#FFFFFF' ? 'border-gray-200' : 'border-transparent'}`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
            {colorVariants.length > MAX_SWATCHES && (
              <span className="text-[11px] text-gray-500 font-medium ml-1">+{colorVariants.length - MAX_SWATCHES}</span>
            )}
          </div>
        )}

        <div className={`flex items-center mt-auto ${compact ? 'flex-wrap gap-x-1.5 sm:space-x-2.5 sm:flex-nowrap' : 'space-x-2.5'}`}>
          {hasVariants && minVariantPrice ? (
            <span className={`text-gray-900 font-bold tracking-tight ${compact ? 'text-[11px] sm:text-[15px]' : 'text-[15px]'}`}>From {formatPrice(minVariantPrice)}</span>
          ) : (
            <span className={`text-gray-900 font-bold tracking-tight ${compact ? 'text-[11px] sm:text-[15px]' : 'text-[15px]'}`}>{formatPrice(price)}</span>
          )}
          {discount > 0 && originalPrice != null && (
            <span className={`text-gray-500 line-through decoration-gray-300 ${compact ? 'text-[9px] sm:text-[13px]' : 'text-[13px]'}`}>{formatPrice(originalPrice)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
