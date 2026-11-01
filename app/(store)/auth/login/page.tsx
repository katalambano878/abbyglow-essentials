'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useRecaptcha } from '@/hooks/useRecaptcha';

/** Only allow same-origin, absolute paths (never protocol-relative "//evil"). */
function safeNext(raw: string | null): string {
  if (!raw) return '/account';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/account';
  return raw;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get('next') ?? searchParams.get('redirect'));
  const reason = searchParams.get('reason');

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const { getCaptchaToken, verifying } = useRecaptcha();

  // Already signed in → go where they were headed.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) {
        router.replace(nextPath);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setAuthError('');

    const newErrors: { email?: string; password?: string } = {};
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
      return;
    }

    setIsLoading(true);
    try {
      const captchaToken = (await getCaptchaToken('login')) || undefined;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email.trim(),
        password: formData.password,
        options: { captchaToken },
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        router.push(nextPath);
        router.refresh(); // Refresh to update auth state in other components
      } else {
        setAuthError('Sign in did not return a session. Please try again.');
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

          {reason === 'timeout' && !authError && (
            <div className="mb-6 p-4 bg-amber-50/80 backdrop-blur-sm border border-amber-100 text-amber-700 rounded-2xl text-[13px] font-medium flex items-center">
              <i className="ri-time-line mr-2 text-lg"></i>
              You were signed out after a period of inactivity.
            </div>
          )}

          {authError && (
            <div className="mb-6 p-4 bg-red-50/80 backdrop-blur-sm border border-red-100 text-red-600 rounded-2xl text-[13px] font-medium flex items-center" role="alert">
              <i className="ri-error-warning-fill mr-2 text-lg"></i>
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="login-email" className="block text-[12px] uppercase tracking-wider font-semibold text-gray-500 pl-1">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
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
              <label htmlFor="login-password" className="block text-[12px] uppercase tracking-wider font-semibold text-gray-500 pl-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`}></i>
                </button>
              </div>
              {errors.password && (
                <p className="text-[13px] font-medium text-red-500 mt-1 pl-1">{errors.password}</p>
              )}
            </div>

            <div className="flex items-center justify-end pt-1 pb-2">
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
        </div>

        <p className="mt-8 text-center text-[15px] text-gray-500 font-light">
          Don&apos;t have an account?{' '}
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FDFDFD] flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-gray-400"></i>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
