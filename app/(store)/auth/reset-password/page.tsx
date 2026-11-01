'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';

type Stage = 'verifying' | 'invalid' | 'form' | 'done';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [stage, setStage] = useState<Stage>(token ? 'verifying' : 'invalid');
  const [linkError, setLinkError] = useState(
    token ? '' : 'This page needs a reset link. Request a new one and open the link from your email.'
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' });
      if (cancelled) return;
      if (error) {
        setLinkError(error.message || 'Invalid or expired reset link');
        setStage('invalid');
      } else {
        setStage('form');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setFormError('Passwords do not match');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFormError(error.message || 'Could not update your password. Please try again.');
        return;
      }
      setStage('done');
      setTimeout(() => {
        router.push('/account');
        router.refresh();
      }, 1500);
    } catch (err: any) {
      setFormError(err?.message || 'Could not update your password. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Set a New Password</h1>
          <p className="text-gray-600">Choose a strong password for your account</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8">
          {stage === 'verifying' && (
            <div className="text-center py-6">
              <i className="ri-loader-4-line animate-spin text-3xl text-brand"></i>
              <p className="text-gray-600 mt-4">Checking your reset link...</p>
            </div>
          )}

          {stage === 'invalid' && (
            <div className="text-center">
              <div className="w-16 h-16 flex items-center justify-center bg-red-50 rounded-full mx-auto mb-6">
                <i className="ri-error-warning-line text-3xl text-red-500"></i>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">Reset link problem</h2>
              <p className="text-gray-600 mb-8" role="alert">{linkError}</p>
              <Link
                href="/auth/forgot-password"
                className="inline-block bg-brand-accent hover:bg-brand-accentDark text-white px-8 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Request a new link
              </Link>
            </div>
          )}

          {stage === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="new-password" className="block text-sm font-semibold text-gray-900 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-800"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`}></i>
                  </button>
                </div>
                <PasswordStrengthMeter password={password} />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-semibold text-gray-900 mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="Repeat your new password"
                />
              </div>

              {formError && (
                <p className="text-sm text-red-600" role="alert">{formError}</p>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="w-full bg-brand-accent hover:bg-brand-accentDark text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isSaving ? 'Saving...' : 'Update Password'}
              </button>
            </form>
          )}

          {stage === 'done' && (
            <div className="text-center">
              <div className="w-16 h-16 flex items-center justify-center bg-green-50 rounded-full mx-auto mb-6">
                <i className="ri-checkbox-circle-line text-3xl text-green-600"></i>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">Password updated</h2>
              <p className="text-gray-600 mb-8">You&apos;re signed in. Taking you to your account...</p>
              <Link href="/account" className="text-brand hover:text-brand-dark font-semibold">
                Go to my account
              </Link>
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link href="/auth/login" className="text-gray-600 hover:text-gray-900 font-medium whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-brand"></i>
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
