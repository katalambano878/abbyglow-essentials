'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import { supabase } from '@/lib/supabase';
import { useRecaptcha } from '@/hooks/useRecaptcha';

function getFriendlyError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('email rate limit exceeded') || lower.includes('over_email_send_rate_limit')) {
    return 'Our system is experiencing high demand. Please wait a few minutes and try again, or contact us for help.';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (lower.includes('password') && lower.includes('weak')) {
    return 'Your password is too weak. Please use at least 8 characters with a mix of letters, numbers, and symbols.';
  }
  if (lower.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Connection error. Please check your internet and try again.';
  }
  return message;
}

export default function SignupPage() {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
    newsletter: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [success, setSuccess] = useState(false);
  const { getToken, verifying } = useRecaptcha();

  // Auto-scroll to error when it appears
  useEffect(() => {
    if (authError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [authError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setAuthError('');
    setIsLoading(true);

    const newErrors: any = {};
    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.phone) {
      newErrors.phone = 'Phone number is required';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (!formData.acceptTerms) {
      newErrors.acceptTerms = 'You must accept the terms and conditions';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setIsLoading(false);
      return;
    }

    // reCAPTCHA verification
    const isHuman = await getToken('signup');
    if (!isHuman) {
      setAuthError('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            phone: formData.phone,
            newsletter: formData.newsletter
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        // Send Welcome Notification
        fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'welcome',
            payload: {
              email: formData.email,
              firstName: formData.firstName
            }
          })
        }).catch(err => console.error('Welcome notification error:', err));
        // If Supabase confirms via email, data.session might be null initially
        if (!data.session) {
          setSuccess(true);
        } else {
          // Auto-login success (if email confirming is off)
          router.push('/account');
          router.refresh();
        }
      }
    } catch (err: any) {
      console.error('Signup error:', err);
      setAuthError(getFriendlyError(err.message || 'Failed to sign up. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-[#FDFDFD] relative flex items-center justify-center py-16 px-4 sm:px-6 overflow-hidden">
        {/* Ethereal Background Glows */}
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-brand-soft/60 rounded-full blur-[120px] pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-brand-soft/40 rounded-full blur-[150px] pointer-events-none translate-x-1/3 translate-y-1/3"></div>

        <div className="max-w-md w-full text-center relative z-10 bg-white/80 backdrop-blur-2xl rounded-[2rem] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] border border-white p-10 sm:p-14">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8 border border-green-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
            <i className="ri-mail-send-line text-3xl text-green-600"></i>
          </div>
          <h1 className="text-3xl font-serif font-bold text-gray-900 mb-4 tracking-tight">Check Your Email</h1>
          <p className="text-gray-500 font-light text-[15px] leading-relaxed mb-10">
            We've sent a secure confirmation link to <br /><strong className="text-gray-900 mt-1 block">{formData.email}</strong>
            Please check your inbox to activate your account.
          </p>
          <Link href="/auth/login" className="group relative inline-flex items-center justify-center px-10 py-4 bg-gray-900 text-white rounded-2xl font-medium overflow-hidden transition-all duration-300 hover:shadow-[0_8px_25px_rgba(17,24,39,0.3)] hover:-translate-y-0.5">
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
            <span className="relative">Return to Login</span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDFDFD] relative flex items-center justify-center py-16 px-4 sm:px-6 overflow-hidden">
      {/* Ethereal Background Glows */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-brand-soft/60 rounded-full blur-[120px] pointer-events-none -translate-x-1/2 -translate-y-1/2 -z-10"></div>
      <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-brand-soft/40 rounded-full blur-[150px] pointer-events-none translate-x-1/3 translate-y-1/3 -z-10"></div>

      <div className="max-w-[460px] w-full relative z-10">
        <div className="text-center mb-10">
          <Link href="/" className="inline-block mb-6 group">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 group-hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] group-hover:-translate-y-1 transition-all duration-300">
              <i className="ri-store-2-line text-2xl text-gray-800"></i>
            </div>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-gray-900 mb-3 tracking-tight">Create Account</h1>
          <p className="text-gray-500 font-light text-[15px] tracking-wide">Join us and start shopping today</p>
        </div>

        <div className="bg-white/80 backdrop-blur-2xl rounded-[2rem] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] border border-white p-8 sm:p-10 relative overflow-hidden">
          {/* Very faint inner highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80"></div>

          {authError && (
            <div ref={errorRef} className="mb-6 p-4 bg-red-50/80 backdrop-blur-sm border border-red-100 text-red-600 rounded-2xl text-[13px] font-medium flex items-start gap-3">
              <i className="ri-error-warning-fill text-lg flex-shrink-0 mt-0.5"></i>
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="block text-[12px] uppercase tracking-wider font-semibold text-gray-500 pl-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className={`w-full px-5 py-3.5 bg-gray-50/50 border rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:ring-0 transition-all duration-300 outline-none text-[15px] text-gray-800 placeholder:text-gray-400 ${errors.firstName ? 'border-red-300 focus:border-red-400' : 'border-gray-100 focus:border-gray-300'
                    }`}
                  placeholder="John"
                />
                {errors.firstName && (
                  <p className="text-[13px] font-medium text-red-500 mt-1 pl-1">{errors.firstName}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-[12px] uppercase tracking-wider font-semibold text-gray-500 pl-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className={`w-full px-5 py-3.5 bg-gray-50/50 border rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:ring-0 transition-all duration-300 outline-none text-[15px] text-gray-800 placeholder:text-gray-400 ${errors.lastName ? 'border-red-300 focus:border-red-400' : 'border-gray-100 focus:border-gray-300'
                    }`}
                  placeholder="Doe"
                />
                {errors.lastName && (
                  <p className="text-[13px] font-medium text-red-500 mt-1 pl-1">{errors.lastName}</p>
                )}
              </div>
            </div>

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
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className={`w-full px-5 py-3.5 bg-gray-50/50 border rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:ring-0 transition-all duration-300 outline-none text-[15px] text-gray-800 placeholder:text-gray-400 ${errors.phone ? 'border-red-300 focus:border-red-400' : 'border-gray-100 focus:border-gray-300'
                  }`}
                placeholder="+233 XX XXX XXXX"
              />
              {errors.phone && (
                <p className="text-[13px] font-medium text-red-500 mt-1 pl-1">{errors.phone}</p>
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
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-800 transition-colors duration-200"
                >
                  <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`}></i>
                </button>
              </div>
              <div className="px-1"><PasswordStrengthMeter password={formData.password} /></div>
              {errors.password && (
                <p className="text-[13px] font-medium text-red-500 mt-1 pl-1">{errors.password}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-[12px] uppercase tracking-wider font-semibold text-gray-500 pl-1">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className={`w-full px-5 py-3.5 pr-12 bg-gray-50/50 border rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:ring-0 transition-all duration-300 outline-none text-[15px] text-gray-800 placeholder:text-gray-400 ${errors.confirmPassword ? 'border-red-300 focus:border-red-400' : 'border-gray-100 focus:border-gray-300'
                    }`}
                  placeholder="Re-enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-800 transition-colors duration-200"
                >
                  <i className={`${showConfirmPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`}></i>
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-[13px] font-medium text-red-500 mt-1 pl-1">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="pt-2 pb-2">
              <label className="flex items-start group cursor-pointer">
                <div className="relative flex items-center justify-center w-4 h-4 mr-3 mt-1 shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.acceptTerms}
                    onChange={(e) => setFormData({ ...formData, acceptTerms: e.target.checked })}
                    className="peer appearance-none w-4 h-4 border border-gray-300 rounded checked:bg-gray-900 checked:border-gray-900 transition-colors duration-200 cursor-pointer"
                  />
                  <i className="ri-check-line absolute text-white text-[11px] opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity duration-200"></i>
                </div>
                <span className="text-[13px] text-gray-500 leading-snug">
                  I agree to the{' '}
                  <Link href="/terms" className="text-gray-800 hover:text-black font-medium transition-colors border-b border-transparent hover:border-gray-900">
                    Terms & Conditions
                  </Link>
                  {' '}and{' '}
                  <Link href="/privacy" className="text-gray-800 hover:text-black font-medium transition-colors border-b border-transparent hover:border-gray-900">
                    Privacy Policy
                  </Link>
                </span>
              </label>
              {errors.acceptTerms && (
                <p className="text-[13px] font-medium text-red-500 mt-2 pl-7">{errors.acceptTerms}</p>
              )}
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
                    <i className="ri-loader-4-line animate-spin"></i> {verifying ? 'Verifying...' : 'Creating account...'}
                  </>
                ) : (
                  <>Create Account <i className="ri-arrow-right-line transition-transform group-hover:translate-x-1"></i></>
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
                <span className="px-4 bg-white text-gray-400">Or Sign Up With</span>
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
          Already have an account?{' '}
          <Link href="/auth/login" className="text-gray-900 font-medium hover:underline underline-offset-4 decoration-gray-300 transition-all">
            Sign in
          </Link>
        </p>

        <div className="mt-12 text-center pb-12 sm:pb-0">
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
