'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import ProductForm from '@/components/admin/ProductForm';
import { supabase } from '@/lib/supabase';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [productData, setProductData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProduct() {
      try {
        setLoadError(null);
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            categories(id, name),
            product_variants(*),
            product_images(*)
          `)
          .eq('id', resolvedParams.id)
          .maybeSingle();

        if (error) throw error;
        setProductData(data || null);
      } catch (error: any) {
        console.error('Error fetching product:', error);
        setLoadError(error?.message || 'Failed to load product');
      } finally {
        setLoading(false);
      }
    }

    if (resolvedParams.id) {
      fetchProduct();
    }
  }, [resolvedParams.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-brand animate-spin mb-4 block"></i>
          <p className="text-gray-500 font-medium">Loading product details...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <i className="ri-error-warning-line text-4xl text-red-500 mb-4 block"></i>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Could not load product</h2>
          <p className="text-gray-600 mb-4">{loadError}</p>
          <Link href="/admin/products" className="text-brand font-semibold hover:underline">Back to products</Link>
        </div>
      </div>
    );
  }

  if (!productData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <i className="ri-search-line text-4xl text-gray-400 mb-4 block"></i>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Product Not Found</h2>
          <p className="text-gray-600 mb-4">The product you are trying to edit does not exist or has been deleted.</p>
          <Link href="/admin/products" className="text-brand font-semibold hover:underline">Back to products</Link>
        </div>
      </div>
    );
  }

  return <ProductForm initialData={productData} isEditMode={true} />;
}
