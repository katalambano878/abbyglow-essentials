'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { DEFAULT_PREORDER_SHIPPING, isPreorderProduct, normalizeProductMetadata } from '@/lib/preorder';
import { DEPOSIT_PERCENT } from '@/lib/payments/plans';

interface ProductFormProps {
    initialData?: any;
    isEditMode?: boolean;
}

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
const PRODUCTS_BUCKET = 'products';

/** Returns the object path inside the products bucket for a public URL we uploaded, or null. */
const storagePathFromUrl = (url: string): string | null => {
    const marker = `/storage/v1/object/public/${PRODUCTS_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    const rest = url.slice(idx + marker.length).split('?')[0];
    try {
        return decodeURIComponent(rest);
    } catch {
        return rest;
    }
};

export default function ProductForm({ initialData, isEditMode = false }: ProductFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState<any[]>([]);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [productName, setProductName] = useState(initialData?.name || '');
    const [categoryId, setCategoryId] = useState(initialData?.category_id || '');
    const [price, setPrice] = useState(initialData?.price || '');
    const [comparePrice, setComparePrice] = useState(initialData?.compare_at_price || '');
    const [sku, setSku] = useState(initialData?.sku || '');
    const [stock, setStock] = useState(initialData?.quantity || '');
    const [moq, setMoq] = useState(initialData?.moq || '1');
    const [lowStockThreshold, setLowStockThreshold] = useState(initialData?.metadata?.low_stock_threshold || '5');
    const [description, setDescription] = useState(initialData?.description || '');
    const [status, setStatus] = useState<string>((initialData?.status || 'active').toLowerCase());
    const [featured, setFeatured] = useState(initialData?.featured || false);
    const [isPreorder, setIsPreorder] = useState(() =>
        initialData ? isPreorderProduct(initialData?.metadata) : false
    );
    const [preorderShipping, setPreorderShipping] = useState(
        initialData?.metadata?.preorder_shipping || DEFAULT_PREORDER_SHIPPING
    );
    const [activeTab, setActiveTab] = useState('general');

    // Auto-generate SKU function
    const generateSku = () => {
        const prefix = 'ST'; // Store identifier prefix
        const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    };

    // --- Variant System ---
    // Preset color palette
    const colorPresets = [
        { name: 'Black', hex: '#000000' },
        { name: 'White', hex: '#FFFFFF' },
        { name: 'Red', hex: '#EF4444' },
        { name: 'Blue', hex: '#3B82F6' },
        { name: 'Navy', hex: '#1E3A5F' },
        { name: 'Green', hex: '#22C55E' },
        { name: 'Yellow', hex: '#EAB308' },
        { name: 'Pink', hex: '#EC4899' },
        { name: 'Purple', hex: '#A855F7' },
        { name: 'Orange', hex: '#F97316' },
        { name: 'Gray', hex: '#6B7280' },
        { name: 'Brown', hex: '#92400E' },
        { name: 'Beige', hex: '#D2B48C' },
        { name: 'Maroon', hex: '#800000' },
        { name: 'Teal', hex: '#14B8A6' },
        { name: 'Cream', hex: '#FFFDD0' },
        { name: 'Gold', hex: '#D4AF37' },
        { name: 'Silver', hex: '#C0C0C0' },
    ];
    const sizePresets = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

    // Parse existing variants to extract unique colors and sizes
    const existingVariants = (initialData?.product_variants || []).map((v: any) => ({
        ...v,
        stock: v.stock ?? v.quantity ?? 0,
        color: v.color ?? v.option2 ?? '',
        // option1 holds the size; legacy rows without options used name for the size
        size: v.option1 ?? (v.option2 || v.name === 'Default' ? '' : (v.name || ''))
    }));

    // key "color|||size" → existing row id, used to diff variants on save
    const existingVariantIdByKey: Record<string, string> = {};
    existingVariants.forEach((v: any) => {
        existingVariantIdByKey[`${v.color || ''}|||${v.size || ''}`] = v.id;
    });

    const [selectedColors, setSelectedColors] = useState<{ name: string; hex: string }[]>(() => {
        const colors = new Map<string, string>();
        existingVariants.forEach((v: any) => {
            if (v.color) {
                const preset = colorPresets.find(c => c.name.toLowerCase() === v.color.toLowerCase());
                colors.set(v.color, preset?.hex || '#888888');
            }
        });
        return Array.from(colors.entries()).map(([name, hex]) => ({ name, hex }));
    });

    const [selectedSizes, setSelectedSizes] = useState<string[]>(() => {
        const sizes = new Set<string>();
        existingVariants.forEach((v: any) => {
            if (v.size) sizes.add(v.size);
        });
        return Array.from(sizes);
    });

    const [customColorName, setCustomColorName] = useState('');
    const [customColorHex, setCustomColorHex] = useState('#888888');
    const [customSize, setCustomSize] = useState('');

    // Build variants from colors × sizes (or just sizes, or just colors)
    const buildVariantKey = (color: string, size: string) => `${color}|||${size}`;

    // Store variant data (price, stock) in a map keyed by "color|||size"
    const [variantData, setVariantData] = useState<Record<string, { price: string; stock: string; sku: string }>>(() => {
        const data: Record<string, { price: string; stock: string; sku: string }> = {};
        existingVariants.forEach((v: any) => {
            const key = buildVariantKey(v.color || '', v.size || '');
            data[key] = {
                price: v.price?.toString() || '',
                stock: v.stock?.toString() || '0',
                sku: v.sku || ''
            };
        });
        return data;
    });

    /**
     * Variants that were never given their own price follow the base price.
     * (They are stored with an explicit value because the column is NOT NULL,
     * so without this a base-price change would silently leave them behind.)
     */
    const handleBasePriceChange = (next: string) => {
        const previous = String(price ?? '');
        setVariantData(prev => {
            const updated: typeof prev = {};
            for (const [key, entry] of Object.entries(prev)) {
                const follows = entry.price === '' || entry.price === previous || Number(entry.price) === Number(previous);
                updated[key] = follows ? { ...entry, price: next } : entry;
            }
            return updated;
        });
        setPrice(next);
    };

    // Computed: all variant combinations
    const variantCombinations = (() => {
        const combos: { color: string; colorHex: string; size: string; key: string }[] = [];
        const colors = selectedColors.length > 0 ? selectedColors : [{ name: '', hex: '' }];
        const sizes = selectedSizes.length > 0 ? selectedSizes : [''];

        for (const color of colors) {
            for (const size of sizes) {
                if (!color.name && !size) continue; // skip if both empty
                const key = buildVariantKey(color.name, size);
                combos.push({ color: color.name, colorHex: color.hex, size, key });
            }
        }
        return combos;
    })();

    // Build the flat variants array for saving (used by handleSubmit)
    const variants = variantCombinations.map(combo => {
        const d = variantData[combo.key] || { price: price, stock: '0', sku: '' };
        return {
            name: combo.size,
            color: combo.color,
            sku: d.sku,
            price: d.price || price,
            stock: d.stock || '0'
        };
    });

    const updateVariantField = (key: string, field: string, value: string) => {
        setVariantData(prev => ({
            ...prev,
            [key]: { ...prev[key] || { price: price, stock: '0', sku: '' }, [field]: value }
        }));
    };

    // Bulk set price/stock for all variants
    const bulkSetField = (field: 'price' | 'stock', value: string) => {
        setVariantData(prev => {
            const updated = { ...prev };
            variantCombinations.forEach(combo => {
                updated[combo.key] = { ...updated[combo.key] || { price: price, stock: '0', sku: '' }, [field]: value };
            });
            return updated;
        });
    };

    const toggleColor = (color: { name: string; hex: string }) => {
        setSelectedColors(prev => {
            const exists = prev.find(c => c.name === color.name);
            if (exists) return prev.filter(c => c.name !== color.name);
            return [...prev, color];
        });
    };

    const toggleSize = (size: string) => {
        setSelectedSizes(prev => {
            if (prev.includes(size)) return prev.filter(s => s !== size);
            return [...prev, size];
        });
    };

    const addCustomColor = () => {
        if (!customColorName.trim()) return;
        const exists = selectedColors.find(c => c.name.toLowerCase() === customColorName.trim().toLowerCase());
        if (!exists) {
            setSelectedColors(prev => [...prev, { name: customColorName.trim(), hex: customColorHex }]);
        }
        setCustomColorName('');
        setCustomColorHex('#888888');
    };

    const addCustomSize = () => {
        if (!customSize.trim()) return;
        if (!selectedSizes.includes(customSize.trim())) {
            setSelectedSizes(prev => [...prev, customSize.trim()]);
        }
        setCustomSize('');
    };

    // Images (sorted by saved position so the primary image stays first)
    const [images, setImages] = useState<any[]>(() =>
        [...(initialData?.product_images || [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    );
    const [uploading, setUploading] = useState(false);
    const initialImages: any[] = initialData?.product_images || [];

    // SEO
    const [seoTitle, setSeoTitle] = useState(initialData?.seo_title || '');
    const [metaDescription, setMetaDescription] = useState(initialData?.seo_description || '');
    const [urlSlug, setUrlSlug] = useState(initialData?.slug || '');
    const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(Boolean(initialData?.slug));
    const [keywords, setKeywords] = useState(initialData?.tags?.join(', ') || '');

    const tabs = [
        { id: 'general', label: 'General', icon: 'ri-information-line' },
        { id: 'pricing', label: 'Pricing & Inventory', icon: 'ri-price-tag-3-line' },
        { id: 'variants', label: 'Variants', icon: 'ri-layout-grid-line' },
        { id: 'images', label: 'Images', icon: 'ri-image-line' },
        { id: 'seo', label: 'SEO', icon: 'ri-search-line' }
    ];

    // Fetch categories once on mount
    useEffect(() => {
        let cancelled = false;
        async function fetchCategories() {
            const { data } = await supabase.from('categories').select('id, name').eq('status', 'active').order('name');
            if (cancelled || !data) return;
            setCategories(data);
            setCategoryId((current: string) => current || (data.length > 0 ? data[0].id : ''));
        }
        fetchCategories();
        return () => { cancelled = true; };
    }, []);

    // Keep slug in sync with product name until user edits slug manually.
    useEffect(() => {
        if (!isEditMode && !isSlugManuallyEdited) {
            setUrlSlug(toSlug(productName || ''));
        }
    }, [productName, isEditMode, isSlugManuallyEdited]);

    // Auto-generate SKU for new products
    useEffect(() => {
        if (!isEditMode && !sku) {
            setSku(generateSku());
        }
    }, [isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target;
        try {
            if (!input.files || input.files.length === 0) return;
            const file = input.files[0];

            const ext = ALLOWED_IMAGE_TYPES[file.type];
            if (!ext) {
                setNotice({ type: 'error', text: 'Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF.' });
                return;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                setNotice({ type: 'error', text: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.` });
                return;
            }
            if (images.length >= 10) {
                setNotice({ type: 'error', text: 'A product can have at most 10 images.' });
                return;
            }

            setUploading(true);
            setNotice(null);
            const baseSlug = toSlug(urlSlug || productName) || 'product';
            const filePath = `${baseSlug}-${Date.now()}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from(PRODUCTS_BUCKET)
                .upload(filePath, file, { contentType: file.type });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from(PRODUCTS_BUCKET)
                .getPublicUrl(filePath);

            setImages((prev) => [...prev, { url: publicUrl, position: prev.length }]);

        } catch (error: any) {
            setNotice({ type: 'error', text: 'Error uploading image: ' + (error?.message || 'unknown error') });
        } finally {
            setUploading(false);
            input.value = '';
        }
    };

    const handleRemoveImage = (indexToRemove: number) => {
        setImages(images.filter((_, idx) => idx !== indexToRemove));
    };

    /** Diff product_images by url: insert new, update moved positions, delete removed (+ storage object best-effort). */
    const syncImages = async (productId: string) => {
        const currentUrls = new Set(images.map((img) => img.url));
        const initialByUrl = new Map<string, any>(initialImages.map((img: any) => [img.url, img]));

        const removed = initialImages.filter((img: any) => !currentUrls.has(img.url));
        if (removed.length > 0) {
            const { error } = await supabase
                .from('product_images')
                .delete()
                .in('id', removed.map((img: any) => img.id));
            if (error) throw new Error(`Could not remove images: ${error.message}`);

            const paths = removed.map((img: any) => storagePathFromUrl(img.url)).filter(Boolean) as string[];
            if (paths.length > 0) {
                const { error: storageError } = await supabase.storage.from(PRODUCTS_BUCKET).remove(paths);
                if (storageError) console.warn('Could not delete storage objects:', storageError.message);
            }
        }

        const inserts: any[] = [];
        for (let idx = 0; idx < images.length; idx++) {
            const img = images[idx];
            const existing = initialByUrl.get(img.url);
            if (existing) {
                if (existing.position !== idx || (existing.alt_text || '') !== productName) {
                    const { error } = await supabase
                        .from('product_images')
                        .update({ position: idx, alt_text: productName })
                        .eq('id', existing.id);
                    if (error) throw new Error(`Could not update image order: ${error.message}`);
                }
            } else {
                inserts.push({ product_id: productId, url: img.url, position: idx, alt_text: productName });
            }
        }
        if (inserts.length > 0) {
            const { error } = await supabase.from('product_images').insert(inserts);
            if (error) throw new Error(`Could not save new images: ${error.message}`);
        }
    };

    /** Diff product_variants by id: update existing combos, insert new ones, delete removed ones. */
    const syncVariants = async (productId: string) => {
        const keepIds = new Set<string>();
        const inserts: any[] = [];

        for (const combo of variantCombinations) {
            const d = variantData[combo.key] || { price: price, stock: '0', sku: '' };
            const colorHex = selectedColors.find(c => c.name === combo.color)?.hex || null;
            const row = {
                product_id: productId,
                name: combo.size || combo.color || 'Default',
                sku: d.sku || null,
                price: parseFloat(d.price || price) || 0,
                quantity: parseInt(d.stock) || 0,
                option1: combo.size || null,
                option2: combo.color?.trim() || null,
                metadata: colorHex ? { color_hex: colorHex } : {}
            };
            const existingId = existingVariantIdByKey[combo.key];
            if (existingId) {
                keepIds.add(existingId);
                const { error } = await supabase.from('product_variants').update(row).eq('id', existingId);
                if (error) throw new Error(`Could not update variant "${row.name}": ${error.message}`);
            } else {
                inserts.push(row);
            }
        }

        if (inserts.length > 0) {
            const { error } = await supabase.from('product_variants').insert(inserts);
            if (error) throw new Error(`Could not add variants: ${error.message}`);
        }

        const toDelete = existingVariants.filter((v: any) => !keepIds.has(v.id));
        for (const variant of toDelete) {
            const { error } = await supabase.from('product_variants').delete().eq('id', variant.id);
            if (error) {
                const label = [variant.color, variant.size].filter(Boolean).join(' / ') || variant.name;
                const inUse = /foreign key|violates|referenced|cart/i.test(error.message || '');
                throw new Error(
                    inUse
                        ? `Variant "${label}" is still referenced by customer carts or orders and cannot be removed. Set its stock to 0 instead.`
                        : `Could not remove variant "${label}": ${error.message}`
                );
            }
        }
    };

    // Variant helpers removed — variants are now auto-generated from selectedColors × selectedSizes

    const handleSubmit = async () => {
        if (!productName.trim()) {
            setNotice({ type: 'error', text: 'Product name is required.' });
            setActiveTab('general');
            return;
        }
        if (!(parseFloat(price) > 0)) {
            setNotice({ type: 'error', text: 'Enter a price greater than 0.' });
            setActiveTab('pricing');
            return;
        }

        try {
            setLoading(true);
            setNotice(null);

            // If product has variants, auto-sync main stock = sum of variant stocks
            const hasVariants = variants.length > 0;
            const variantStockTotal = hasVariants
                ? variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)
                : parseInt(stock) || 0;

            const productData = {
                name: productName,
                slug: toSlug(urlSlug || productName),
                description,
                category_id: categoryId || null,
                price: parseFloat(price) || 0,
                compare_at_price: comparePrice ? parseFloat(comparePrice) : null,
                sku: sku || generateSku(), // Auto-generate if empty
                quantity: hasVariants ? variantStockTotal : (parseInt(stock) || 0),
                moq: parseInt(moq) || 1,
                status: status.toLowerCase(),
                featured,
                seo_title: seoTitle,
                seo_description: metaDescription,
                tags: (keywords as string).split(',').map((k: string) => k.trim()).filter(Boolean),
                metadata: normalizeProductMetadata(
                    {
                        ...(initialData?.metadata || {}),
                        low_stock_threshold: parseInt(lowStockThreshold) || 5,
                    },
                    { isPreorder, preorderShipping }
                ),
            };

            let productId = initialData?.id;
            let error;

            if (isEditMode && productId) {
                // Update existing
                const { error: updateError } = await supabase
                    .from('products')
                    .update(productData)
                    .eq('id', productId);
                error = updateError;
            } else {
                // Create new
                const { data: newProduct, error: insertError } = await supabase
                    .from('products')
                    .insert([productData])
                    .select()
                    .single();

                if (newProduct) productId = newProduct.id;
                error = insertError;
            }

            if (error) throw error;
            if (!productId) throw new Error('Product was not saved — no id returned.');

            await syncImages(productId);
            await syncVariants(productId);

            router.push('/admin/products');

        } catch (err: any) {
            console.error('Error saving product:', err);
            setNotice({ type: 'error', text: err?.message || 'Could not save the product.' });
        } finally {
            setLoading(false);
        }
    };

    const previewSlug = initialData?.slug;
    const canPreview = isEditMode && Boolean(previewSlug) && (initialData?.status || '').toLowerCase() === 'active';
    const previewTooltip = !previewSlug
        ? 'Save the product to get a preview link'
        : (initialData?.status || '').toLowerCase() !== 'active'
            ? 'Only active products are visible in the store'
            : 'Open the product page in a new tab';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link
                        href="/admin/products"
                        className="w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
                    >
                        <i className="ri-arrow-left-line text-xl text-gray-700"></i>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            {isEditMode ? 'Edit Product' : 'Add New Product'}
                        </h1>
                        <p className="text-gray-600 mt-1">
                            {isEditMode ? 'Update product information and settings' : 'Create a new product for your catalog'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    {isEditMode && (
                        canPreview ? (
                            <Link
                                href={`/product/${previewSlug}`}
                                target="_blank"
                                title={previewTooltip}
                                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors font-semibold whitespace-nowrap cursor-pointer flex items-center"
                            >
                                <i className="ri-eye-line mr-2"></i>
                                Preview
                            </Link>
                        ) : (
                            <span
                                title={previewTooltip}
                                aria-disabled="true"
                                className="px-6 py-3 border-2 border-gray-200 text-gray-400 rounded-lg font-semibold whitespace-nowrap cursor-not-allowed flex items-center"
                            >
                                <i className="ri-eye-off-line mr-2"></i>
                                Preview
                            </span>
                        )
                    )}
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className={`px-6 py-3 bg-brand hover:bg-brand-dark text-white rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? (
                            <>
                                <i className="ri-loader-4-line animate-spin mr-2"></i>
                                Saving...
                            </>
                        ) : (
                            <>
                                <i className="ri-save-line mr-2"></i>
                                {isEditMode ? 'Save Changes' : 'Create Product'}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {notice && (
                <div className={`rounded-lg p-4 text-sm flex items-start justify-between gap-4 border ${notice.type === 'success' ? 'bg-brand-soft text-brand border-brand/30' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <span>{notice.text}</span>
                    <button onClick={() => setNotice(null)} className="shrink-0 cursor-pointer" aria-label="Dismiss">
                        <i className="ri-close-line text-lg"></i>
                    </button>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 overflow-x-auto">
                    <div className="flex">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center space-x-2 px-6 py-4 font-semibold whitespace-nowrap transition-colors border-b-2 cursor-pointer ${activeTab === tab.id
                                    ? 'border-brand text-brand bg-brand-soft'
                                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <i className={`${tab.icon} text-xl`}></i>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-8">
                    {activeTab === 'general' && (
                        <div className="space-y-6 max-w-3xl">
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Product Name *
                                </label>
                                <input
                                    type="text"
                                    value={productName}
                                    onChange={(e) => setProductName(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                    placeholder="Enter product name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={6}
                                    maxLength={500}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand resize-none"
                                    placeholder="Describe your product..."
                                />
                                <p className="text-sm text-gray-500 mt-2">{description.length}/500 characters</p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Category *
                                    </label>
                                    <select
                                        value={categoryId}
                                        onChange={(e) => setCategoryId(e.target.value)}
                                        className="w-full px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand cursor-pointer"
                                    >
                                        {categories.length === 0 && <option value="">Loading categories...</option>}
                                        {categories.length > 0 && <option value="">Select a category</option>}
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Status
                                    </label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                        className="w-full px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand cursor-pointer"
                                    >
                                        <option value="active">Active</option>
                                        <option value="draft">Draft</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    checked={featured}
                                    onChange={(e) => setFeatured(e.target.checked)}
                                    className="w-5 h-5 text-brand border-gray-300 rounded focus:ring-brand cursor-pointer"
                                />
                                <label className="text-gray-900 font-medium">
                                    Feature this product on homepage
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-3">
                                    Availability
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsPreorder(false)}
                                        className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                                            !isPreorder
                                                ? 'border-brand bg-brand-soft'
                                                : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-gray-900">Available</span>
                                            <span
                                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                    !isPreorder ? 'border-brand bg-brand' : 'border-gray-300'
                                                }`}
                                            >
                                                {!isPreorder && <i className="ri-check-line text-white text-xs"></i>}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-600">
                                            In stock for customers in Ghana — ready to sell and ship.
                                        </p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsPreorder(true)}
                                        className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                                            isPreorder
                                                ? 'border-brand-accent bg-orange-50'
                                                : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-gray-900">Pre-order</span>
                                            <span
                                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                    isPreorder ? 'border-brand-accent bg-brand-accent' : 'border-gray-300'
                                                }`}
                                            >
                                                {isPreorder && <i className="ri-check-line text-white text-xs"></i>}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-600">
                                            Ships when stock arrives. Customers can pay full or {DEPOSIT_PERCENT}% deposit.
                                        </p>
                                    </button>
                                </div>
                            </div>

                            {isPreorder && (
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Pre-order delivery note
                                    </label>
                                    <input
                                        type="text"
                                        value={preorderShipping}
                                        onChange={(e) => setPreorderShipping(e.target.value)}
                                        placeholder={DEFAULT_PREORDER_SHIPPING}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Shown on the product page (e.g. “Ships in 2–3 weeks”).
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="space-y-6 max-w-3xl">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Price (GH₵) *
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">GH₵</span>
                                        <input
                                            type="number"
                                            value={price}
                                            onChange={(e) => handleBasePriceChange(e.target.value)}
                                            className="w-full pl-16 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Compare at Price (GH₵)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">GH₵</span>
                                        <input
                                            type="number"
                                            value={comparePrice}
                                            onChange={(e) => setComparePrice(e.target.value)}
                                            className="w-full pl-16 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2">Show original price for comparison</p>
                                </div>
                            </div>

                            <div className="p-4 bg-brand-soft border border-brand/30 rounded-lg">
                                <p className="text-brand-ink font-semibold mb-1">Discount Calculation</p>
                                {price && comparePrice && parseFloat(comparePrice) > parseFloat(price) ? (
                                    <p className="text-brand">
                                        Savings: GH₵ {(parseFloat(comparePrice) - parseFloat(price)).toFixed(2)}
                                        <span className="ml-2">
                                            ({(((parseFloat(comparePrice) - parseFloat(price)) / parseFloat(comparePrice)) * 100).toFixed(0)}% off)
                                        </span>
                                    </p>
                                ) : (
                                    <p className="text-brand text-sm">Enter a valid compare price higher than the price to see discount.</p>
                                )}
                            </div>

                            <div className="pt-6 border-t border-gray-200">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Inventory</h3>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            SKU (Auto-generated)
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={sku}
                                                onChange={(e) => setSku(e.target.value)}
                                                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand font-mono bg-gray-50"
                                                placeholder="Auto-generated"
                                                readOnly
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setSku(generateSku())}
                                                className="px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-brand hover:bg-brand-soft transition-colors cursor-pointer"
                                                title="Generate new SKU"
                                            >
                                                <i className="ri-refresh-line text-lg"></i>
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1">SKU is auto-generated. Click refresh to generate a new one.</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Stock Quantity *
                                        </label>
                                        {variants.length > 0 ? (
                                            <div>
                                                <input
                                                    type="number"
                                                    value={variants.reduce((sum: number, v: any) => sum + (parseInt(v.stock) || 0), 0)}
                                                    readOnly
                                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                                                />
                                                <p className="text-sm text-amber-600 mt-1 flex items-center">
                                                    <i className="ri-information-line mr-1"></i>
                                                    Stock is managed per variant. Edit stock in the Variants tab.
                                                </p>
                                            </div>
                                        ) : (
                                            <input
                                                type="number"
                                                value={stock}
                                                onChange={(e) => setStock(e.target.value)}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                                placeholder="0"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6 mt-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Minimum Order Quantity (MOQ)
                                        </label>
                                        <input
                                            type="number"
                                            value={moq}
                                            onChange={(e) => setMoq(e.target.value)}
                                            min="1"
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                            placeholder="1"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Minimum quantity customers must order</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Low Stock Threshold
                                        </label>
                                        <input
                                            type="number"
                                            value={lowStockThreshold}
                                            onChange={(e) => setLowStockThreshold(e.target.value)}
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Get notified when stock falls below this number</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'variants' && (
                        <div className="space-y-8">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Product Variants</h3>
                                <p className="text-gray-600 mt-1">Select colors and sizes below — variants are generated automatically</p>
                            </div>

                            {/* STEP 1: Colors */}
                            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center">
                                    <i className="ri-palette-line mr-2 text-lg text-brand"></i>
                                    Step 1: Select Colors
                                    {selectedColors.length > 0 && (
                                        <span className="ml-2 bg-brand-soft text-brand text-xs font-semibold px-2 py-0.5 rounded-full">
                                            {selectedColors.length} selected
                                        </span>
                                    )}
                                </h4>
                                <p className="text-xs text-gray-500 mb-4">Click colors to add/remove. Skip if product has no color options.</p>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {colorPresets.map(color => {
                                        const isSelected = selectedColors.some(c => c.name === color.name);
                                        return (
                                            <button
                                                key={color.name}
                                                onClick={() => toggleColor(color)}
                                                className={`flex items-center space-x-2 px-3 py-2 rounded-lg border-2 transition-all text-sm font-medium ${isSelected
                                                        ? 'border-brand bg-brand-soft ring-1 ring-brand'
                                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                                    }`}
                                                title={color.name}
                                            >
                                                <span
                                                    className="w-5 h-5 rounded-full border border-gray-300 flex-shrink-0"
                                                    style={{ backgroundColor: color.hex }}
                                                ></span>
                                                <span className={isSelected ? 'text-brand' : 'text-gray-700'}>{color.name}</span>
                                                {isSelected && <i className="ri-check-line text-brand"></i>}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom color */}
                                <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                                    <input
                                        type="color"
                                        value={customColorHex}
                                        onChange={(e) => setCustomColorHex(e.target.value)}
                                        className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                                        title="Pick a custom color"
                                    />
                                    <input
                                        type="text"
                                        value={customColorName}
                                        onChange={(e) => setCustomColorName(e.target.value)}
                                        placeholder="Custom color name"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && addCustomColor()}
                                    />
                                    <button
                                        onClick={addCustomColor}
                                        disabled={!customColorName.trim()}
                                        className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Add Color
                                    </button>
                                </div>

                                {/* Selected colors summary */}
                                {selectedColors.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {selectedColors.map(color => (
                                            <span key={color.name} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm shadow-sm">
                                                <span className="w-3.5 h-3.5 rounded-full border border-gray-300" style={{ backgroundColor: color.hex }}></span>
                                                {color.name}
                                                <button onClick={() => toggleColor(color)} className="text-gray-400 hover:text-red-500 ml-1">
                                                    <i className="ri-close-line text-sm"></i>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* STEP 2: Sizes */}
                            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center">
                                    <i className="ri-ruler-line mr-2 text-lg text-brand"></i>
                                    Step 2: Select Sizes
                                    {selectedSizes.length > 0 && (
                                        <span className="ml-2 bg-brand-soft text-brand text-xs font-semibold px-2 py-0.5 rounded-full">
                                            {selectedSizes.length} selected
                                        </span>
                                    )}
                                </h4>
                                <p className="text-xs text-gray-500 mb-4">Click sizes to add/remove. Use custom for volumes (100ml), weights, etc.</p>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {sizePresets.map(size => {
                                        const isSelected = selectedSizes.includes(size);
                                        return (
                                            <button
                                                key={size}
                                                onClick={() => toggleSize(size)}
                                                className={`px-5 py-2.5 rounded-lg border-2 font-semibold text-sm transition-all ${isSelected
                                                        ? 'border-brand bg-brand-soft text-brand ring-1 ring-brand'
                                                        : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                                                    }`}
                                            >
                                                {size}
                                                {isSelected && <i className="ri-check-line ml-1.5 text-brand"></i>}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom size */}
                                <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                                    <input
                                        type="text"
                                        value={customSize}
                                        onChange={(e) => setCustomSize(e.target.value)}
                                        placeholder="Custom size (e.g. 100ml, One Size, 42)"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && addCustomSize()}
                                    />
                                    <button
                                        onClick={addCustomSize}
                                        disabled={!customSize.trim()}
                                        className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Add Size
                                    </button>
                                </div>

                                {/* Selected sizes summary */}
                                {selectedSizes.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {selectedSizes.map(size => (
                                            <span key={size} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm shadow-sm font-medium">
                                                {size}
                                                <button onClick={() => toggleSize(size)} className="text-gray-400 hover:text-red-500 ml-1">
                                                    <i className="ri-close-line text-sm"></i>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* STEP 3: Variant Grid */}
                            {variantCombinations.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900 flex items-center">
                                                <i className="ri-grid-line mr-2 text-lg text-purple-600"></i>
                                                Step 3: Set Price & Stock ({variantCombinations.length} variant{variantCombinations.length > 1 ? 's' : ''})
                                            </h4>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const val = prompt('Set price for ALL variants:', price?.toString() || '0');
                                                    if (val !== null) bulkSetField('price', val);
                                                }}
                                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                Bulk Set Price
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const val = prompt('Set stock for ALL variants:', '0');
                                                    if (val !== null) bulkSetField('stock', val);
                                                }}
                                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                Bulk Set Stock
                                            </button>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    {selectedColors.length > 0 && (
                                                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Color</th>
                                                    )}
                                                    {selectedSizes.length > 0 && (
                                                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Size</th>
                                                    )}
                                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Price (GH₵)</th>
                                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Stock</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {variantCombinations.map((combo) => {
                                                    const d = variantData[combo.key] || { price: price, stock: '0', sku: '' };
                                                    return (
                                                        <tr key={combo.key} className="border-b border-gray-100 hover:bg-gray-50">
                                                            {selectedColors.length > 0 && (
                                                                <td className="py-3 px-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <span
                                                                            className="w-5 h-5 rounded-full border border-gray-300 flex-shrink-0"
                                                                            style={{ backgroundColor: combo.colorHex }}
                                                                        ></span>
                                                                        <span className="text-sm font-medium text-gray-900">{combo.color}</span>
                                                                    </div>
                                                                </td>
                                                            )}
                                                            {selectedSizes.length > 0 && (
                                                                <td className="py-3 px-4">
                                                                    <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded">
                                                                        {combo.size}
                                                                    </span>
                                                                </td>
                                                            )}
                                                            <td className="py-3 px-4">
                                                                <input
                                                                    type="number"
                                                                    value={d.price}
                                                                    onChange={(e) => updateVariantField(combo.key, 'price', e.target.value)}
                                                                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-brand focus:border-brand"
                                                                    step="0.01"
                                                                    placeholder={price?.toString() || '0'}
                                                                />
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <input
                                                                    type="number"
                                                                    value={d.stock}
                                                                    onChange={(e) => updateVariantField(combo.key, 'stock', e.target.value)}
                                                                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-brand focus:border-brand"
                                                                    placeholder="0"
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="p-3 bg-brand-soft border-t border-brand/30">
                                        <p className="text-xs text-brand flex items-center">
                                            <i className="ri-information-line mr-1.5"></i>
                                            Total stock across all variants: <strong className="ml-1">{variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)}</strong>
                                        </p>
                                    </div>
                                </div>
                            )}

                            {variantCombinations.length === 0 && (
                                <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                                    <i className="ri-palette-line text-4xl text-gray-300 mb-2 block"></i>
                                    <p className="font-medium">No variants configured</p>
                                    <p className="text-sm mt-1">Select colors and/or sizes above to create variant combinations.</p>
                                    <p className="text-xs mt-2 text-gray-400">You can add just colors, just sizes, or both for a full grid.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'images' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Product Images</h3>
                                <p className="text-gray-600">Add up to 10 images. First image will be the primary image.</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {images.map((img: any, index: number) => (
                                    <div key={index} className="relative group">
                                        <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden border-2 border-gray-200">
                                            <img src={img.url} alt={`Product ${index + 1}`} className="w-full h-full object-cover" />
                                        </div>
                                        {index === 0 && (
                                            <span className="absolute top-2 left-2 bg-brand text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap">
                                                Primary
                                            </span>
                                        )}
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2 rounded-xl">
                                            <a href={img.url} target="_blank" rel="noreferrer" className="w-9 h-9 flex items-center justify-center bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                                                <i className="ri-eye-line"></i>
                                            </a>
                                            <button
                                                onClick={() => handleRemoveImage(index)}
                                                className="w-9 h-9 flex items-center justify-center bg-white text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                            >
                                                <i className="ri-delete-bin-line"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                <label className={`aspect-square border-2 border-dashed border-gray-300 rounded-xl hover:border-brand hover:bg-brand-soft transition-colors flex flex-col items-center justify-center space-y-2 text-gray-600 hover:text-brand cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    {uploading ? (
                                        <i className="ri-loader-4-line animate-spin text-3xl"></i>
                                    ) : (
                                        <i className="ri-upload-2-line text-3xl"></i>
                                    )}
                                    <span className="text-sm font-semibold">{uploading ? 'Uploading...' : 'Upload Image'}</span>
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                        disabled={uploading}
                                    />
                                </label>
                            </div>

                            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                <p className="text-sm text-gray-700">
                                    <strong>Image Guidelines:</strong> Use high-quality images (min 1000x1000px), white or neutral backgrounds work best.
                                    Supported formats: JPEG, PNG, WebP, GIF, AVIF (max 10MB each). Removed images are deleted when you save.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'seo' && (
                        <div className="space-y-6 max-w-3xl">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Search Engine Optimization</h3>
                                <p className="text-gray-600">Optimize how this product appears in search results</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Page Title
                                </label>
                                <input
                                    type="text"
                                    value={seoTitle}
                                    onChange={(e) => setSeoTitle(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                    placeholder="Seo friendly title"
                                />
                                <p className="text-sm text-gray-500 mt-2">60 characters recommended</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Meta Description
                                </label>
                                <textarea
                                    rows={3}
                                    maxLength={500}
                                    value={metaDescription}
                                    onChange={(e) => setMetaDescription(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand resize-none"
                                    placeholder="Seo friendly description"
                                />
                                <p className="text-sm text-gray-500 mt-2">160 characters recommended</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    URL Slug
                                </label>
                                <div className="flex items-center">
                                    <span className="text-gray-600 bg-gray-100 px-4 py-3 border-2 border-r-0 border-gray-300 rounded-l-lg">
                                        store.com/product/
                                    </span>
                                    <input
                                        type="text"
                                        value={urlSlug}
                                        onChange={(e) => {
                                            const inputValue = e.target.value;
                                            const normalizedSlug = toSlug(inputValue);
                                            setUrlSlug(normalizedSlug);
                                            setIsSlugManuallyEdited(Boolean(normalizedSlug));
                                        }}
                                        className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-r-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                        placeholder="product-slug"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Keywords
                                </label>
                                <input
                                    type="text"
                                    value={keywords}
                                    onChange={(e) => setKeywords(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                    placeholder="keyword1, keyword2"
                                />
                                <p className="text-sm text-gray-500 mt-2">Separate keywords with commas</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
