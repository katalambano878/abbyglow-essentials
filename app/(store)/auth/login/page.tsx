'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useRecaptcha } from '@/hooks/useRecaptcha';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const { getToken, verifying } = useRecaptcha();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setAuthError('');
    setIsLoading(true);

    // Validation
    const newErrors: any = {};
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setIsLoading(false);
      return;
    }

    // reCAPTCHA verification
    const isHuman = await getToken('login');
    if (!isHuman) {
      setAuthError('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        router.push('/account');
        router.refresh(); // Refresh to update auth state in other components
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setAuthError(error.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FDFDFD] relative flex items-center justify-center py-16 px-4 sm:px-6 overflow-hidden">
      {/* Ethereal Background Glows */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-brand-soft/60 rounded-full blur-[120px] pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-brand-soft/40 rounded-full blur-[150px] pointer-events-none translate-x-1/3 translate-y-1/3"></div>

      <div className="max-w-[420px] w-full relative z-10">
        <div className="text-center mb-10">
          <Link href="/" className="inline-block mb-8 group">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 group-hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] group-hover:-translate-y-1 transition-all duration-300">
              <i className="ri-store-2-line text-2xl text-gray-800"></i>
            </div>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-gray-900 mb-3 tracking-tight">Welcome Back</h1>
          <p className="text-gray-500 font-light text-[15px] tracking-wide">Sign in to your account to continue</p>
        </div>

        <div className="bg-white/80 backdrop-blur-2xl rounded-[2rem] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] border border-white p-8 sm:p-10 relative overflow-hidden">
          {/* Very faint inner highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80"></div>

          {authError && (
            <div className="mb-6 p-4 bg-red-50/80 backdrop-blur-sm border border-red-100 text-red-600 rounded-2xl text-[13px] font-medium flex items-center">
              <i className="ri-error-warning-fill mr-2 text-lg"></i>
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-[12px] uppercase tracking-wider font-semibold text-gray-500 pl-1">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={`w-full px-5 py-3.5 bg-gray-50/50 border rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:ring-0 transition-all duration-300 outline-none text-[15px] text-gray-800 placeholder:text-gray-400 ${errors.email ? 'border-red-300 focus:border-red-400' : 'border-gray-100 focus:border-gray-300'
                  }`}
                placeholder="you@example.com"
              />
              {errors.email && (
                <p className="text-[13px] font-medium text-red-500 mt-1 pl-1">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-[12px] uppercase tracking-wider font-semibold text-gray-500 pl-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`w-full px-5 py-3.5 pr-12 bg-gray-50/50 border rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:ring-0 transition-all duration-300 outline-none text-[15px] text-gray-800 placeholder:text-gray-400 ${errors.password ? 'border-red-300 focus:border-red-400' : 'border-gray-100 focus:border-gray-300'
                    }`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-800 transition-colors duration-200"
                >
                  <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`}></i>
                </button>
              </div>
              {errors.password && (
                <p className="text-[13px] font-medium text-red-500 mt-1 pl-1">{errors.password}</p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 pb-2">
              <label className="flex items-center group cursor-pointer">
                <div className="relative flex items-center justify-center w-4 h-4 mr-2">
                  <input
                    type="checkbox"
                    checked={formData.rememberMe}
                    onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                    className="peer appearance-none w-4 h-4 border border-gray-300 rounded checked:bg-gray-900 checked:border-gray-900 transition-colors duration-200 cursor-pointer"
                  />
                  <i className="ri-check-line absolute text-white text-[11px] opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity duration-200"></i>
                </div>
                <span className="text-[14px] text-gray-600 group-hover:text-gray-900 transition-colors">Remember me</span>
              </label>
              <Link href="/auth/forgot-password" className="text-[14px] text-gray-500 hover:text-gray-900 font-medium transition-colors border-b border-transparent hover:border-gray-900">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading || verifying}
              className="group relative w-full flex items-center justify-center px-8 py-4 bg-brand-accent hover:bg-brand-accentDark text-white rounded-2xl font-medium overflow-hidden transition-all duration-300 hover:shadow-[0_8px_25px_rgba(17,24,39,0.3)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              <span className="relative flex items-center gap-2">
                {isLoading || verifying ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i> {verifying ? 'Verifying...' : 'Signing in...'}
                  </>
                ) : (
                  <>Sign In <i className="ri-arrow-right-line transition-transform group-hover:translate-x-1"></i></>
                )}
              </span>
            </button>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100"></div>
              </div>
              <div className="relative flex justify-center text-[12px] uppercase tracking-widest font-semibold">
                <span className="px-4 bg-white text-gray-400">Or Continue With</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <button
                disabled
                className="flex items-center justify-center space-x-2 border border-gray-100 bg-gray-50/50 py-3.5 rounded-2xl cursor-not-allowed transition-all"
              >
                <i className="ri-google-fill text-lg text-gray-400"></i>
                <span className="font-medium text-[14px] text-gray-400">Google</span>
              </button>
              <button
                disabled
                className="flex items-center justify-center space-x-2 border border-gray-100 bg-gray-50/50 py-3.5 rounded-2xl cursor-not-allowed transition-all"
              >
                <i className="ri-facebook-fill text-lg text-gray-400"></i>
                <span className="font-medium text-[14px] text-gray-400">Facebook</span>
              </button>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-[15px] text-gray-500 font-light">
          Don't have an account?{' '}
          <Link href="/auth/signup" className="text-gray-900 font-medium hover:underline underline-offset-4 decoration-gray-300 transition-all">
            Create one now
          </Link>
        </p>

        <div className="mt-12 text-center">
          <Link href="/" className="inline-flex items-center text-[14px] text-gray-400 hover:text-gray-800 font-medium transition-colors group">
            <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center mr-3 group-hover:border-gray-300 transition-colors shadow-sm">
              <i className="ri-arrow-left-line transition-transform group-hover:-translate-x-0.5"></i>
            </div>
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
