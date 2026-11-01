'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import OrderHistory from './OrderHistory';
import AddressBook from './AddressBook';
import { supabase } from '@/lib/supabase';

const TABS = ['profile', 'orders', 'addresses', 'security'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | null): value is Tab {
  return !!value && (TABS as readonly string[]).includes(value);
}

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: Tab = isTab(tabParam) ? tabParam : 'profile';

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Update active tab when URL param changes
  useEffect(() => {
    if (isTab(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Profile Form States
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
  const [profileLoading, setProfileLoading] = useState(false);

  // Password Form States
  const [passwordData, setPasswordData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        router.push('/auth/login?next=/account');
        return;
      }

      const u = session.user;
      setUser(u);
      setProfileData({
        firstName: u.user_metadata?.first_name || '',
        lastName: u.user_metadata?.last_name || '',
        email: u.email || '',
        phone: u.user_metadata?.phone ?? u.phone ?? ''
      });
      setLoading(false);
    }
    checkUser();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMessage({ type: '', text: '' });

    try {
      const firstName = profileData.firstName.trim();
      const lastName = profileData.lastName.trim();
      const phone = profileData.phone.trim();
      const { data, error } = await supabase.auth.updateUser({
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`.trim(),
          phone
        }
      });

      if (error) throw error;
      if (data.user) {
        setUser(data.user);
        setProfileData({
          firstName: data.user.user_metadata?.first_name || '',
          lastName: data.user.user_metadata?.last_name || '',
          email: data.user.email || '',
          phone: data.user.user_metadata?.phone ?? data.user.phone ?? ''
        });
      }
      setProfileMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: err.message || 'Could not update your profile.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage({ type: '', text: '' });
    if (passwordData.password.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }
    if (passwordData.password !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setPasswordLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.password
      });
      if (error) throw error;
      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
      setPasswordData({ password: '', confirmPassword: '' });
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || 'Could not update your password.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Server-side logout failed (expired session, network) — clear locally anyway.
      await supabase.auth.signOut({ scope: 'local' });
    }
    router.push('/');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <i className="ri-loader-4-line animate-spin text-4xl text-brand"></i>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 py-8 lg:py-12 pb-24 lg:pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
            <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
              <div className="w-12 h-12 md:w-16 md:h-16 flex-shrink-0 rounded-full bg-brand-soft flex items-center justify-center text-brand text-xl md:text-2xl font-bold shadow-inner border-2 border-white">
                {profileData.firstName?.[0] || user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate pr-2">{profileData.firstName ? `Hello, ${profileData.firstName}!` : 'Welcome Back'}</h1>
                <p className="text-gray-500 text-sm font-medium truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:text-red-600 hover:border-red-200 transition-all font-medium shadow-sm w-full md:w-auto justify-center md:justify-start"
            >
              <i className="ri-logout-box-r-line"></i>
              Sign Out
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Desktop Sidebar Navigation */}
            <div className="hidden lg:block lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden sticky top-24">
                <nav className="p-2 space-y-1">
                  {[
                    { id: 'profile' as Tab, icon: 'ri-user-settings-line', label: 'Profile Settings' },
                    { id: 'orders' as Tab, icon: 'ri-shopping-bag-3-line', label: 'Order History' },
                    { id: 'addresses' as Tab, icon: 'ri-map-pin-2-line', label: 'Addresses' },
                    { id: 'security' as Tab, icon: 'ri-shield-keyhole-line', label: 'Security' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left group ${activeTab === tab.id
                        ? 'bg-brand-soft text-brand shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                      <i className={`${tab.icon} text-xl transition-colors ${activeTab === tab.id ? 'text-brand' : 'text-gray-400 group-hover:text-gray-600'}`}></i>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                  <Link
                    href="/account/privacy"
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left group text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <i className="ri-lock-2-line text-xl text-gray-400 group-hover:text-gray-600 transition-colors"></i>
                    <span>Privacy &amp; Data</span>
                  </Link>
                </nav>
              </div>
            </div>

            {/* Mobile Horizontal Navigation */}
            <div className="lg:hidden col-span-1 pb-2 -mx-4 px-4">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {[
                  { id: 'profile' as Tab, icon: 'ri-user-settings-line', label: 'Profile' },
                  { id: 'orders' as Tab, icon: 'ri-shopping-bag-3-line', label: 'Orders' },
                  { id: 'addresses' as Tab, icon: 'ri-map-pin-2-line', label: 'Address' },
                  { id: 'security' as Tab, icon: 'ri-shield-keyhole-line', label: 'Security' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium whitespace-nowrap transition-all border shadow-sm ${activeTab === tab.id
                      ? 'bg-brand text-white border-brand ring-2 ring-brand/20'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <i className={tab.icon}></i>
                    <span>{tab.label}</span>
                  </button>
                ))}
                <Link
                  href="/account/privacy"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium whitespace-nowrap transition-all border shadow-sm bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                >
                  <i className="ri-lock-2-line"></i>
                  <span>Privacy</span>
                </Link>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-8 min-h-[500px]">
                {activeTab === 'profile' && (
                  <div className="max-w-2xl">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Profile Information</h2>
                    <p className="text-gray-500 mb-8">Update your personal details and contact info.</p>

                    {profileMessage.text && (
                      <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 ${profileMessage.type === 'success' ? 'bg-brand-soft text-brand border border-brand/20' : 'bg-red-50 text-red-700 border border-red-100'}`} role="status">
                        <i className={`text-xl mt-0.5 ${profileMessage.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}`}></i>
                        <div>{profileMessage.text}</div>
                      </div>
                    )}

                    <form onSubmit={handleUpdateProfile} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label htmlFor="profile-first" className="text-sm font-semibold text-gray-900">First Name</label>
                          <input
                            id="profile-first"
                            type="text"
                            autoComplete="given-name"
                            value={profileData.firstName}
                            onChange={e => setProfileData({ ...profileData, firstName: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-brand-soft focus:border-brand transition-all bg-gray-50 focus:bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="profile-last" className="text-sm font-semibold text-gray-900">Last Name</label>
                          <input
                            id="profile-last"
                            type="text"
                            autoComplete="family-name"
                            value={profileData.lastName}
                            onChange={e => setProfileData({ ...profileData, lastName: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-brand-soft focus:border-brand transition-all bg-gray-50 focus:bg-white"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="profile-email" className="text-sm font-semibold text-gray-900">Email Address</label>
                        <div className="relative">
                          <i className="ri-mail-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                          <input
                            id="profile-email"
                            type="email"
                            value={profileData.email}
                            disabled
                            className="w-full pl-11 pr-4 py-3 border-2 border-gray-100 bg-gray-50/50 rounded-xl text-gray-500 cursor-not-allowed"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold bg-gray-200 text-gray-600 px-2 py-1 rounded">Read Only</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="profile-phone" className="text-sm font-semibold text-gray-900">Phone Number</label>
                        <div className="relative">
                          <i className="ri-phone-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                          <input
                            id="profile-phone"
                            type="tel"
                            autoComplete="tel"
                            value={profileData.phone}
                            onChange={e => setProfileData({ ...profileData, phone: e.target.value })}
                            placeholder="+233 XX XXX XXXX"
                            className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-brand-soft focus:border-brand transition-all bg-gray-50 focus:bg-white"
                          />
                        </div>
                      </div>

                      <div className="pt-4">
                        <button
                          type="submit"
                          disabled={profileLoading}
                          className="px-8 py-3 bg-brand hover:bg-brand-dark text-white rounded-xl font-semibold transition-all shadow-lg shadow-brand/20 active:scale-95 disabled:opacity-50 disabled:shadow-none"
                        >
                          {profileLoading ? 'Saving Info...' : 'Save Profile Information'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {activeTab === 'orders' && <OrderHistory />}

                {activeTab === 'addresses' && <AddressBook />}

                {activeTab === 'security' && (
                  <div className="max-w-2xl">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Security Settings</h2>
                    <p className="text-gray-500 mb-8">Manage how you sign in to your account.</p>

                    <div className="flex items-center gap-3 p-5 border border-gray-200 rounded-2xl bg-white mb-10">
                      <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-brand flex-shrink-0">
                        <i className="ri-mail-line text-xl"></i>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-500">Email</p>
                        <p className="font-bold text-gray-900 truncate">{user?.email}</p>
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 mb-2">Change Password</h3>
                    <p className="text-gray-500 mb-6">Use at least 8 characters. You&apos;ll stay signed in after the change.</p>

                    {passwordMessage.text && (
                      <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 ${passwordMessage.type === 'success' ? 'bg-brand-soft text-brand border border-brand/20' : 'bg-red-50 text-red-700 border border-red-100'}`} role="status">
                        <i className={`text-xl mt-0.5 ${passwordMessage.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}`}></i>
                        <div>{passwordMessage.text}</div>
                      </div>
                    )}

                    <form onSubmit={handleChangePassword} className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label htmlFor="new-password" className="text-sm font-semibold text-gray-900">New Password</label>
                          <div className="relative">
                            <i className="ri-lock-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input
                              id="new-password"
                              type="password"
                              autoComplete="new-password"
                              value={passwordData.password}
                              onChange={e => setPasswordData({ ...passwordData, password: e.target.value })}
                              className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-brand-soft focus:border-brand transition-all bg-gray-50 focus:bg-white"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="confirm-password" className="text-sm font-semibold text-gray-900">Confirm Password</label>
                          <div className="relative">
                            <i className="ri-lock-check-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input
                              id="confirm-password"
                              type="password"
                              autoComplete="new-password"
                              value={passwordData.confirmPassword}
                              onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                              className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-brand-soft focus:border-brand transition-all bg-gray-50 focus:bg-white"
                            />
                          </div>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={passwordLoading}
                        className="px-8 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-all shadow-lg shadow-gray-900/10 active:scale-95 disabled:opacity-50 disabled:shadow-none"
                      >
                        {passwordLoading ? 'Updating...' : 'Update Password'}
                      </button>
                    </form>

                    <div className="mt-12 pt-8 border-t border-gray-100">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Privacy &amp; Data</h3>
                      <p className="text-gray-500 mb-4">Download a copy of your data or request account deletion.</p>
                      <Link
                        href="/account/privacy"
                        className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-xl font-medium text-gray-700 hover:border-brand hover:text-brand transition-colors"
                      >
                        <i className="ri-lock-2-line"></i>
                        Manage privacy settings
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <i className="ri-loader-4-line animate-spin text-4xl text-brand"></i>
      </div>
    }>
      <AccountContent />
    </Suspense>
  );
}
