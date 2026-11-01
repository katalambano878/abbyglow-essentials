'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useRecaptcha } from '@/hooks/useRecaptcha';

const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** `Secure` only over https — on plain-http dev hosts the browser would drop the cookie and login would loop. */
const cookieFlags = () => `path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;

const setSessionCookies = (accessToken: string, refreshToken?: string | null) => {
  document.cookie = `sb-access-token=${accessToken}; max-age=${ACCESS_COOKIE_MAX_AGE}; ${cookieFlags()}`;
  if (refreshToken) {
    document.cookie = `sb-refresh-token=${refreshToken}; max-age=${REFRESH_COOKIE_MAX_AGE}; ${cookieFlags()}`;
  }
};

const clearSessionCookies = () => {
  document.cookie = `sb-access-token=; max-age=0; ${cookieFlags()}`;
  document.cookie = `sb-refresh-token=; max-age=0; ${cookieFlags()}`;
};

/** Only allow redirects back into the admin area. */
const safeRedirect = (value: string | null) =>
  value && value.startsWith('/admin') && !value.startsWith('//') ? value : '/admin';

const errorMessages: Record<string, string> = {
  session_expired: 'Your session expired, please sign in again',
  unauthorized: 'This account does not have admin access',
};

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get('redirect'));
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(() => (urlError && errorMessages[urlError]) || '');
  const { getCaptchaToken, verifying } = useRecaptcha();

  // Already signed in with an admin/staff profile? Set the cookie and go straight in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (urlError === 'unauthorized') return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (profile && (profile.role === 'admin' || profile.role === 'staff')) {
          setSessionCookies(session.access_token, session.refresh_token);
          router.replace(redirectTo);
          return;
        }
      } catch (err) {
        console.warn('Session check failed:', err);
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router, redirectTo, urlError]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setIsLoading(true);

    try {
      const captchaToken = (await getCaptchaToken('admin_login')) || undefined;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });

      if (error) throw error;
      if (!data.session) throw new Error('Login failed');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .maybeSingle();

      if (profileError || !profile || (profile.role !== 'admin' && profile.role !== 'staff')) {
        clearSessionCookies();
        await supabase.auth.signOut();
        clearSessionCookies();
        throw new Error(errorMessages.unauthorized);
      }

      // Set auth cookies so middleware can verify the session server-side
      setSessionCookies(data.session.access_token, data.session.refresh_token);

      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-soft via-white to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image src="/logo.png" alt="AbbyGlow Essentials" width={574} height={433} className="h-14 w-auto mx-auto object-contain" />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-6 mb-2">Admin Login</h1>
          <p className="text-gray-600">Sign in to access the admin dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {info && !error && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3">
              <i className="ri-information-line text-amber-600 text-xl mt-0.5"></i>
              <p className="text-amber-800 text-sm">{info}</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
              <i className="ri-error-warning-line text-red-600 text-xl mt-0.5"></i>
              <div>
                <p className="text-red-800 font-semibold">Login Failed</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Email Address
              </label>
              <div className="relative">
                <i className="ri-mail-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="admin@example.com"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Password
              </label>
              <div className="relative">
                <i className="ri-lock-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center"
                >
                  <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`}></i>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || verifying || checkingSession}
              className="w-full bg-brand hover:bg-brand-dark text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLoading || verifying || checkingSession ? (
                <span className="flex items-center justify-center space-x-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  <span>{checkingSession ? 'Checking session...' : verifying ? 'Verifying...' : 'Signing in...'}</span>
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Admin access is restricted to users with admin/staff role */}
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-600 hover:text-brand transition-colors whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Store
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>}>
      <AdminLoginForm />
    </Suspense>
  );
}
