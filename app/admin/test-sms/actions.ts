'use server';

import { verifyAdminToken } from '@/lib/auth';
import { sendSMS } from '@/lib/notifications';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** userId → timestamps of test sends inside the current window (per server instance). */
const sendLog = new Map<string, number[]>();

function checkTestSmsLimit(userId: string): { allowed: boolean; retryInSeconds: number } {
    const now = Date.now();
    const recent = (sendLog.get(userId) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
        const retryInSeconds = Math.ceil((recent[0] + RATE_LIMIT_WINDOW_MS - now) / 1000);
        sendLog.set(userId, recent);
        return { allowed: false, retryInSeconds };
    }
    recent.push(now);
    sendLog.set(userId, recent);
    return { allowed: true, retryInSeconds: 0 };
}

function maskPhone(phone: string) {
    const digits = phone.replace(/\D/g, '');
    return digits.length > 4 ? `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}` : '****';
}

export async function testSmsAction(phone: string, message: string, authToken: string) {
    // SECURITY: only administrators may fire test messages through the live SMS pipeline
    const auth = await verifyAdminToken(authToken);
    if (!auth.authenticated) {
        return {
            success: false,
            error: 'Unauthorized: ' + (auth.error || 'Admin access required')
        };
    }
    if (auth.role !== 'admin') {
        return { success: false, error: 'Unauthorized: the SMS debugger is limited to the admin role' };
    }

    const userId = auth.user?.id || auth.user?.email || 'unknown';
    const limit = checkTestSmsLimit(String(userId));
    if (!limit.allowed) {
        return {
            success: false,
            error: `Rate limit: at most ${RATE_LIMIT_MAX} test messages per 10 minutes. Try again in ${limit.retryInSeconds}s.`
        };
    }

    try {
        if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 9) {
            return { success: false, error: 'Invalid phone number' };
        }
        if (!message || typeof message !== 'string' || message.length > 1000) {
            return { success: false, error: 'Invalid or too long message' };
        }

        // Goes through the real pipeline (Taysend first, Moolre fallback) exactly like order SMS.
        const result = await sendSMS({ to: phone, message });

        if (!result) {
            return {
                success: false,
                error: 'No SMS provider accepted the message (check TAYSEND / MOOLRE_SMS_API_KEY configuration and server logs)',
                to: maskPhone(phone)
            };
        }

        const ok = (result as any)?.status === 1 || (result as any)?.success === true;
        return {
            success: ok,
            result,
            to: maskPhone(phone)
        };
    } catch (error: any) {
        // SECURITY: no stack traces or phone numbers in the response/logs
        console.error('[Test SMS] Error:', error?.message);
        return {
            success: false,
            error: error?.message || 'SMS sending failed'
        };
    }
}
