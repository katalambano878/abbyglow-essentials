'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const IDLE_TIMEOUT = 25 * 60 * 1000;
const WARNING_TIME = 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;

function clearAuthCookies() {
  for (const name of ['sb-access-token', 'sb-refresh-token']) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  }
}

/**
 * Idle-session guard for signed-in customers only. Anonymous visitors are
 * never interrupted. Activity is tracked in a ref so listeners are registered
 * once instead of on every scroll.
 */
export default function SessionTimeoutWarning() {
  const [signedIn, setSignedIn] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const lastActivity = useRef(Date.now());
  const loggingOut = useRef(false);

  // Only arm for signed-in users.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSignedIn(Boolean(data.session));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      lastActivity.current = Date.now();
      setShowWarning(false);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = useCallback(async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // fall through — cookies are cleared regardless
    }
    clearAuthCookies();
    window.location.href = '/auth/login?reason=timeout';
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setShowWarning(false);
      return;
    }

    lastActivity.current = Date.now();

    const resetTimer = () => {
      lastActivity.current = Date.now();
      setShowWarning((open) => (open ? false : open));
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    const checkInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivity.current;

      if (timeSinceActivity >= IDLE_TIMEOUT) {
        handleLogout();
      } else if (timeSinceActivity >= IDLE_TIMEOUT - WARNING_TIME) {
        setShowWarning(true);
        setCountdown(Math.ceil((IDLE_TIMEOUT - timeSinceActivity) / 1000));
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
      clearInterval(checkInterval);
    };
  }, [signedIn, handleLogout]);

  const handleStayLoggedIn = () => {
    lastActivity.current = Date.now();
    setShowWarning(false);
    setCountdown(60);
  };

  if (!signedIn || !showWarning) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="session-timeout-title">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <i className="ri-time-line text-2xl text-orange-600"></i>
          </div>
          <div>
            <h3 id="session-timeout-title" className="font-bold text-lg">Session Timeout Warning</h3>
            <p className="text-sm text-gray-600">Your session is about to expire</p>
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700 mb-2">
            You will be automatically logged out in:
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-orange-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-1000"
                style={{ width: `${(countdown / 60) * 100}%` }}
              />
            </div>
            <span className="text-2xl font-bold text-orange-600 tabular-nums">
              {countdown}s
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleLogout}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium whitespace-nowrap"
          >
            Logout Now
          </button>
          <button
            onClick={handleStayLoggedIn}
            className="flex-1 px-4 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium whitespace-nowrap"
          >
            Stay Logged In
          </button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          For your security, sessions expire after 25 minutes of inactivity
        </p>
      </div>
    </div>
  );
}
