'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useCart } from '@/context/CartContext';

interface MiniCartProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MiniCart({ isOpen, onClose }: MiniCartProps) {
  const { cart, removeFromCart, updateQuantity, subtotal } = useCart();

  // Lock body scroll when cart is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-gray-900 bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
      ></div>

      <div className="fixed top-0 right-0 h-[100dvh] w-[500px] max-w-full bg-white shadow-2xl z-50 flex flex-col slide-in-right">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-[22px] font-bold text-[#111827]">
            Shopping Cart ({cart.reduce((sum, i) => sum + i.quantity, 0)})
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-2xl text-[#374151]"></i>
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white min-h-0">
            <div className="w-[130px] h-[130px] flex items-center justify-center bg-[#f3f4f6] rounded-full mb-6">
              <i className="ri-shopping-cart-2-line text-[#9ca3af] text-[64px]"></i>
            </div>
            <h3 className="text-2xl font-bold text-[#111827] mb-2">Your cart is empty</h3>
            <p className="text-[#6b7280] mb-8 text-[15px] max-w-[200px] leading-relaxed">
              Add items to get started
            </p>
            <Link
              href="/shop"
              onClick={onClose}
              className="w-[240px] py-3.5 bg-brand-accent hover:bg-brand-accentDark text-white rounded-lg font-bold transition-colors text-center cursor-pointer shadow-sm text-[15px]"
            >
              Continue Shopping
            </Link>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-white">
              <div className="space-y-6">
                {cart.map((item) => (
                  <div key={`${item.id}-${item.variant}`} className="flex space-x-4">
                    <div className="w-[100px] h-[100px] bg-white flex-shrink-0 border-0 rounded-md overflow-hidden">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover object-center"
                      />
                    </div>

                    <div className="flex-1 min-w-0 pr-1 flex flex-col justify-center">
                      <div className="flex justify-between items-start mb-0.5">
                        <h3 className="font-bold text-[#111827] text-[17px] leading-tight line-clamp-2">{item.name}</h3>
                        <button
                          onClick={() => removeFromCart(item.id, item.variant)}
                          className="text-[#ef4444] hover:text-red-700 transition-colors ml-4 cursor-pointer mt-0.5"
                        >
                          <i className="ri-delete-bin-line text-lg"></i>
                        </button>
                      </div>

                      {item.variant && (
                        <p className="text-sm text-gray-500 mb-2">
                          {item.variant}
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-[17px] font-bold text-[#0A0F1D]">
                          GH₵{item.price.toFixed(2)}
                        </span>

                        <div className="flex items-center border border-gray-200 rounded text-[#111827] bg-white h-9 shadow-sm">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1, item.variant)}
                            className="w-9 h-full flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer text-[#4b5563]"
                          >
                            {item.quantity <= (item.moq || 1) ? (
                              <i className="ri-delete-bin-line text-[#ef4444]"></i>
                            ) : (
                              <i className="ri-subtract-line"></i>
                            )}
                          </button>
                          <span className="w-10 text-center font-bold text-[15px]">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1, item.variant)}
                            className="w-9 h-full flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer text-[#4b5563]"
                            disabled={item.quantity >= item.maxStock}
                          >
                            <i className="ri-add-line"></i>
                          </button>
                        </div>
                      </div>

                      {item.quantity >= item.maxStock && (
                        <p className="text-xs text-amber-600 mt-1">Max stock reached</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 p-6 bg-white shrink-0">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#374151] font-[500] text-[17px]">Subtotal</span>
                <span className="text-[24px] font-bold text-[#111827]">GH₵{subtotal.toFixed(2)}</span>
              </div>

              <p className="text-[15px] text-[#6b7280] mb-6 text-center">
                Shipping calculated at checkout
              </p>

              <div className="space-y-3 flex flex-col items-center">
                <Link
                  href="/checkout"
                  onClick={onClose}
                  className="flex items-center justify-center w-[240px] max-w-full py-3.5 bg-brand-accent hover:bg-brand-accentDark text-white rounded-lg font-bold transition-colors cursor-pointer text-[15px]"
                >
                  Proceed to Checkout
                </Link>
                <Link
                  href="/cart"
                  onClick={onClose}
                  className="flex items-center justify-center w-[240px] max-w-full py-3.5 border-2 border-gray-200 text-[#111827] bg-white hover:bg-gray-50 rounded-lg font-bold transition-colors cursor-pointer text-[15px]"
                >
                  View Cart
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
