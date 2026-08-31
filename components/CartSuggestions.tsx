'use client';

import Link from 'next/link';

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
}

export default function CartSuggestions() {
  const suggestedProducts: Product[] = [
    {
      id: '21',
      name: 'Premium Wireless Headphones',
      price: 129.99,
      originalPrice: 179.99,
      image: 'https://readdy.ai/api/search-image?query=Premium%20wireless%20over-ear%20headphones%20with%20black%20matte%20finish%20and%20cushioned%20ear%20cups%20displayed%20on%20a%20clean%20white%20studio%20background%20with%20soft%20lighting%20emphasizing%20the%20sleek%20modern%20design%20and%20premium%20quality%20materials%20perfect%20for%20ecommerce%20product%20photography&width=400&height=400&seq=cart-sugg-1&orientation=squarish',
      rating: 4.8
    },
    {
      id: '22',
      name: 'Leather Card Holder Wallet',
      price: 34.99,
      originalPrice: 49.99,
      image: 'https://readdy.ai/api/search-image?query=Elegant%20minimalist%20brown%20leather%20card%20holder%20wallet%20with%20multiple%20card%20slots%20displayed%20open%20on%20a%20clean%20white%20marble%20surface%20with%20soft%20natural%20lighting%20showcasing%20premium%20leather%20texture%20and%20craftsmanship%20perfect%20for%20ecommerce%20product%20photography&width=400&height=400&seq=cart-sugg-2&orientation=squarish',
      rating: 4.7
    },
    {
      id: '23',
      name: 'Smart Watch Band',
      price: 24.99,
      image: 'https://readdy.ai/api/search-image?query=Modern%20silicone%20smart%20watch%20band%20in%20sleek%20black%20color%20with%20metal%20clasp%20displayed%20on%20a%20clean%20white%20surface%20with%20soft%20studio%20lighting%20highlighting%20the%20texture%20and%20flexibility%20of%20the%20band%20perfect%20for%20ecommerce%20product%20photography&width=400&height=400&seq=cart-sugg-3&orientation=squarish',
      rating: 4.6
    },
    {
      id: '24',
      name: 'Phone Stand Holder',
      price: 19.99,
      originalPrice: 29.99,
      image: 'https://readdy.ai/api/search-image?query=Modern%20minimalist%20aluminum%20phone%20stand%20holder%20in%20silver%20finish%20with%20adjustable%20angle%20displayed%20on%20a%20clean%20white%20desk%20surface%20with%20soft%20studio%20lighting%20emphasizing%20the%20sleek%20design%20and%20premium%20quality%20perfect%20for%20ecommerce%20product%20photography&width=400&height=400&seq=cart-sugg-4&orientation=squarish',
      rating: 4.5
    }
  ];

  return (
    <div className="bg-brand-soft border-2 border-brand/20 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">You Might Also Like</h3>
        <span className="text-sm text-brand font-medium whitespace-nowrap">Boost Your Order</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {suggestedProducts.map((product) => (
          <div key={product.id} className="group flex flex-col h-full bg-white rounded-[1.5rem] border border-black/[0.04] p-2.5 sm:p-3 hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.06)] hover:border-black/[0.08] transition-all duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]">
            <Link href={`/product/${product.id}`} className="relative block aspect-[4/5] overflow-hidden rounded-[1rem] bg-[#FAFAFA] mb-5">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover object-top transition-transform duration-1000 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hidden lg:flex z-20 bg-black/[0.02] backdrop-blur-[2px]">
                <button className="bg-white/95 backdrop-blur-2xl text-gray-900 border border-white/40 hover:bg-brand-accent hover:text-white hover:border-brand-accent px-6 py-3.5 rounded-full text-[10px] uppercase tracking-[0.2em] font-semibold shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all duration-500 flex items-center justify-center space-x-2 translate-y-4 group-hover:translate-y-0">
                  <span>Quick Add</span>
                </button>
              </div>
            </Link>

            <div className="flex flex-col flex-grow px-2 items-center text-center pb-2">
              <Link href={`/product/${product.id}`}>
                <h4 className="font-serif text-[15.5px] leading-[1.4] text-gray-900 mb-2 line-clamp-2 group-hover:text-black/60 transition-colors">{product.name}</h4>
              </Link>
              <div className="flex items-center justify-center space-x-2.5 mt-auto pt-2">
                <span className="text-gray-900 font-medium text-[13.5px] tracking-wide">GH₵{product.price.toFixed(2)}</span>
                {product.originalPrice && (
                  <span className="text-[12px] text-gray-400 line-through decoration-gray-300/70">GH₵{product.originalPrice.toFixed(2)}</span>
                )}
              </div>

              <div className="mt-4 w-full lg:hidden">
                <button className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 py-2.5 rounded-xl text-[10px] uppercase tracking-[0.2em] font-semibold hover:bg-gray-100 active:bg-gray-200 transition-colors flex items-center justify-center">
                  <span>Quick Add</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
