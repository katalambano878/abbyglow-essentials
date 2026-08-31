import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import PageHero from '@/components/PageHero';

export const revalidate = 0; // Ensure fresh data on every visit

export default async function CategoriesPage() {
  const { data: categoriesData } = await supabase
    .from('categories')
    .select(`
      id,
      name,
      slug,
      description,
      image_url,
      position
    `)
    .eq('status', 'active')
    .order('position', { ascending: true });

  const categoryImages: Record<string, string> = {
    electronics: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&q=80',
    beauty: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&q=80',
    'home-kitchen': 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=800&q=80',
    fashion: 'https://images.unsplash.com/photo-1483985988350-763728e1935b?w=800&q=80',
    'hair-care': 'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=800&q=80',
    fitness: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
    'phones-gadgets': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80',
    fragrance: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80',
    home: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80',
    furniture: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80',
    kitchen: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=800&q=80',
    gym: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
    tools: 'https://images.unsplash.com/photo-1581244277943-4252a3f98475?w=800&q=80',
    activewear: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
    accessories: 'https://images.unsplash.com/photo-1581244277943-4252a3f98475?w=800&q=80',
  };

  const fallbackImages = [
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
    'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=800&q=80',
    'https://images.unsplash.com/photo-1581244277943-4252a3f98475?w=800&q=80',
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80',
  ];

  const palette = [
    { color: 'from-brand to-brand-dark', icon: 'ri-home-smile-line' },
    { color: 'from-brand to-brand-dark', icon: 'ri-tools-line' },
    { color: 'from-emerald-500 to-emerald-700', icon: 'ri-heart-pulse-line' },
    { color: 'from-amber-500 to-amber-700', icon: 'ri-restaurant-line' },
    { color: 'from-slate-600 to-slate-800', icon: 'ri-plug-line' },
    { color: 'from-brand to-brand-dark', icon: 'ri-store-2-line' },
  ];

  const categories = categoriesData?.map((c, i) => {
    const style = palette[i % palette.length];
    return {
      ...c,
      image:
        c.image_url ||
        `/images/categories/${c.slug}.png`,
      color: style.color,
      icon: style.icon,
      // Optional: Fetch product count if needed, currently skipping for performance/simplicity
      productCount: 'Browse',
    };
  }) || [];

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="Shop by Category"
        subtitle="Browse home equipment, gym gear, kitchen tools, electronics, and everyday essentials"
        backgroundImage="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1920&q=85"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {categories.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/shop?category=${category.slug}`}
                className="group relative bg-white p-2.5 sm:p-3 rounded-[2rem] sm:rounded-[2.5rem] flex flex-col border border-gray-100/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] transition-all duration-1000 hover:-translate-y-1 cursor-pointer"
              >
                {/* Image Section */}
                <div className="relative h-64 sm:h-72 w-full overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-gray-50">
                  <img
                    src={category.image}
                    alt={category.name}
                    className="w-full h-full object-cover transition-transform duration-1000 ease-[0.25,0.46,0.45,0.94] group-hover:scale-105"
                  />
                  {/* Subtle ethereal overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 via-gray-900/10 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-700"></div>

                  {/* Floating Elements on Image */}
                  <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between z-10">
                    <div className="flex gap-4 items-center">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-700">
                        <i className={`${category.icon} text-2xl text-white`}></i>
                      </div>
                      <span className="px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white/90 text-[11px] font-bold tracking-[0.2em] uppercase shadow-sm">
                        Collection
                      </span>
                    </div>
                  </div>
                </div>

                {/* Content Section */}
                <div className="px-5 py-6 sm:px-6 flex flex-col flex-1 relative z-20">
                  <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-3 tracking-tight group-hover:text-brand-dark transition-colors duration-500">
                    {category.name}
                  </h3>
                  <p className="text-gray-500 font-light leading-relaxed text-[15px] mb-8 line-clamp-2">
                    {category.description || 'Explore our exclusive collection in this category.'}
                  </p>

                  {/* Bottom Action Area */}
                  <div className="mt-auto pt-5 border-t border-gray-100/60 flex items-center justify-between">
                    <span className="text-gray-900 font-semibold text-sm tracking-wide group-hover:text-brand transition-colors duration-500">
                      Explore Collection
                    </span>
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-brand-soft group-hover:shadow-md transition-all duration-500 -rotate-45 group-hover:rotate-0">
                      <i className="ri-arrow-right-line text-lg text-gray-400 group-hover:text-brand transition-colors duration-500"></i>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-gray-50 rounded-xl">
            <i className="ri-inbox-line text-5xl text-gray-300 mb-4"></i>
            <p className="text-xl text-gray-500">No categories found.</p>
          </div>
        )}
      </div>

      {/* Premium CTA Section */}
      <div className="bg-white py-20 px-4 sm:px-6 lg:px-8 flex justify-center border-t border-gray-50">
        <div className="relative w-full max-w-5xl rounded-[3rem] overflow-hidden bg-gray-900 border border-gray-800 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] group">
          {/* Subtle elegant glow effects */}
          <div className="absolute top-0 right-0 -m-32 w-96 h-96 bg-brand/20 rounded-full blur-[100px] pointer-events-none group-hover:bg-brand-dark/30 transition-colors duration-1000"></div>
          <div className="absolute bottom-0 left-0 -m-32 w-80 h-80 bg-brand/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-brand-dark/20 transition-colors duration-1000"></div>

          {/* Glass Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-50 pointer-events-none"></div>

          <div className="relative z-10 px-6 py-16 sm:p-20 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-center mb-8 shadow-xl">
              <i className="ri-search-eye-line text-3xl text-brand-accent"></i>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-6 text-white tracking-tight">
              Can't Find What You're <span className="text-transparent bg-clip-text bg-gradient-to-br from-brand-accent via-white to-brand-soft">Looking For?</span>
            </h2>
            <p className="text-lg text-gray-400 mb-10 leading-relaxed max-w-2xl font-light">
              Try our advanced search or contact our dedicated team for personalised product recommendations tailored to your style.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/shop"
                className="group/btn relative inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-white text-gray-900 font-bold text-sm sm:text-base transition-all duration-500 hover:scale-105 shadow-[0_0_0_4px_rgba(255,255,255,0.05)] hover:shadow-[0_0_0_8px_rgba(255,255,255,0.1)]"
              >
                <i className="ri-search-line text-brand"></i>
                <span>Search All Products</span>
              </Link>
              <Link
                href="/contact"
                className="group/btn2 relative inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-white/10 border border-white/20 text-white font-medium text-sm sm:text-base transition-all duration-500 hover:bg-white/20 hover:scale-105 backdrop-blur-md"
              >
                <i className="ri-customer-service-2-line text-brand-accent"></i>
                <span>Contact Support</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
