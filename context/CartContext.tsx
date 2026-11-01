'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

export type CartItem = {
    id: string;
    name: string;
    price: number;
    image: string;
    quantity: number;
    /** Display label for the chosen variant, e.g. "Color / Name" */
    variant?: string;
    /** product_variants.id for the chosen variant (sent to checkout) */
    variantId?: string | null;
    slug: string;
    maxStock: number;
    moq?: number; // Minimum Order Quantity
    isPreorder?: boolean;
};

type CartContextType = {
    cart: CartItem[];
    addToCart: (item: CartItem) => void;
    removeFromCart: (itemId: string, variant?: string) => void;
    updateQuantity: (itemId: string, quantity: number, variant?: string) => void;
    clearCart: () => void;
    cartCount: number;
    subtotal: number;
    isCartOpen: boolean;
    setIsCartOpen: (isOpen: boolean) => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = 'cart';

const isValidUUID = (str: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

function readCart(): CartItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return [];
        const parsed: CartItem[] = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => {
            if (!item || !item.id || !item.name || typeof item.price !== 'number') return false;
            if (!isValidUUID(item.id)) return false; // legacy slug-as-id lines
            if (!item.slug) item.slug = item.id;
            if (item.variantId === undefined) item.variantId = null;
            return true;
        });
    } catch (e) {
        console.error('Failed to parse cart:', e);
        return [];
    }
}

function writeCart(items: CartItem[]) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        window.dispatchEvent(new Event('cartUpdated')); // compatibility with legacy listeners
    } catch (e) {
        console.error('Failed to save cart:', e);
    }
}

/** Two lines are the same cart line when product id and variant id match (variant label as fallback). */
function sameLine(a: CartItem, id: string, variantId?: string | null, variantLabel?: string) {
    if (a.id !== id) return false;
    if (variantId !== undefined) return (a.variantId ?? null) === (variantId ?? null);
    return (a.variant || undefined) === (variantLabel || undefined);
}

export function CartProvider({ children }: { children: ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);

    // Load cart from localStorage on mount (with legacy-item cleanup)
    useEffect(() => {
        const items = readCart();
        setCart(items);
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw && JSON.parse(raw).length !== items.length) writeCart(items);
        } catch {
            writeCart(items);
        }
    }, []);

    /**
     * Every mutation computes the next cart from the latest persisted state and
     * writes it to localStorage synchronously, so a "Buy now -> /checkout"
     * navigation can never race the React commit.
     */
    const commit = useCallback((updater: (prev: CartItem[]) => CartItem[]) => {
        const next = updater(readCart());
        writeCart(next);
        setCart(next);
    }, []);

    const addToCart = useCallback((newItem: CartItem) => {
        const item: CartItem = { ...newItem, variantId: newItem.variantId ?? null };
        commit((prev) => {
            const idx = prev.findIndex((line) => sameLine(line, item.id, item.variantId, item.variant));
            if (idx > -1) {
                const existing = prev[idx];
                const maxStock = item.maxStock > 0 ? item.maxStock : existing.maxStock;
                const nextCart = [...prev];
                nextCart[idx] = {
                    ...existing,
                    price: item.price,
                    image: item.image || existing.image,
                    name: item.name || existing.name,
                    slug: item.slug || existing.slug,
                    variant: item.variant ?? existing.variant,
                    maxStock,
                    moq: item.moq ?? existing.moq,
                    isPreorder: item.isPreorder ?? existing.isPreorder,
                    quantity: Math.min(existing.quantity + item.quantity, maxStock),
                };
                return nextCart;
            }
            return [...prev, item];
        });
        setIsCartOpen(true);
    }, [commit]);

    const removeFromCart = useCallback((itemId: string, variant?: string) => {
        commit((prev) => prev.filter((line) => !sameLine(line, itemId, undefined, variant)));
    }, [commit]);

    const updateQuantity = useCallback((itemId: string, quantity: number, variant?: string) => {
        commit((prev) => {
            const item = prev.find((line) => sameLine(line, itemId, undefined, variant));
            if (!item) return prev;
            const minQty = item.moq || 1;
            if (quantity < minQty) {
                return prev.filter((line) => !sameLine(line, itemId, undefined, variant));
            }
            const clampedQty = Math.min(Math.max(quantity, minQty), item.maxStock);
            return prev.map((line) =>
                sameLine(line, itemId, undefined, variant) ? { ...line, quantity: clampedQty } : line
            );
        });
    }, [commit]);

    const clearCart = useCallback(() => {
        commit(() => []);
    }, [commit]);

    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return (
        <CartContext.Provider value={{
            cart,
            addToCart,
            removeFromCart,
            updateQuantity,
            clearCart,
            cartCount,
            subtotal,
            isCartOpen,
            setIsCartOpen
        }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
