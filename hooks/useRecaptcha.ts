'use client';

import { useCallback, useState } from 'react';
import { executeRecaptcha } from '@/lib/recaptcha';

/**
 * React hook for reCAPTCHA v3 integration.
 *
 *   const { getToken, getCaptchaToken, verifying } = useRecaptcha();
 *
 * - getCaptchaToken(action) returns a fresh token to pass to an endpoint that
 *   verifies it itself (the auth shim via supabase-js `options.captchaToken`,
 *   or any API route). This is the secure form: the token is bound to the
 *   request that performs the write.
 * - getToken(action) verifies the token through /api/recaptcha/verify and
 *   returns a boolean. Tokens are single-use, so never combine both for one action.
 *
 * When NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not configured both resolve permissively
 * (null token / true), and the server skips verification as well.
 */
export function useRecaptcha() {
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getCaptchaToken = useCallback(async (action: string): Promise<string | null> => {
        setError(null);
        if (!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) return null;
        setVerifying(true);
        try {
            const token = await executeRecaptcha(action);
            if (!token) setError('Could not get reCAPTCHA token. Please try again.');
            return token;
        } catch (err) {
            console.error('[reCAPTCHA] token error:', err);
            setError('Verification error. Please try again.');
            return null;
        } finally {
            setVerifying(false);
        }
    }, []);

    const getToken = useCallback(async (action: string): Promise<boolean> => {
        setError(null);

        // If reCAPTCHA is not configured, allow through (dev mode)
        if (!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
            return true;
        }

        setVerifying(true);
        try {
            const token = await executeRecaptcha(action);
            if (!token) {
                setError('Could not get reCAPTCHA token. Please try again.');
                return false;
            }

            // Verify on server side
            const response = await fetch('/api/recaptcha/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action }),
            });

            const result = await response.json();
            if (!result.success) {
                setError(result.error || 'Verification failed. Please try again.');
                return false;
            }

            return true;
        } catch (err: any) {
            console.error('[reCAPTCHA] Hook error:', err);
            setError('Verification error. Please try again.');
            return false;
        } finally {
            setVerifying(false);
        }
    }, []);

    /** True when the server will insist on a captcha token for auth calls. */
    const captchaRequired = Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);

    return { getToken, getCaptchaToken, captchaRequired, verifying, error, clearError: () => setError(null) };
}
