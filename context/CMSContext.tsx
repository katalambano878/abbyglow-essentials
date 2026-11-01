'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

interface SiteSettings {
    site_name: string;
    site_tagline: string;
    site_logo: string;
    contact_email: string;
    contact_phone: string;
    contact_address: string;
    social_facebook: string;
    social_instagram: string;
    social_twitter: string;
    social_tiktok: string;
    social_snapchat: string;
    social_youtube: string;
    primary_color: string;
    secondary_color: string;
    currency: string;
    currency_symbol: string;
    [key: string]: string;
}

interface CMSContent {
    id: string;
    section: string;
    block_key: string;
    title: string | null;
    subtitle: string | null;
    content: string | null;
    image_url: string | null;
    button_text: string | null;
    button_url: string | null;
    metadata: Record<string, any>;
    is_active: boolean;
}

interface Banner {
    id: string;
    name: string;
    type: string;
    title: string | null;
    subtitle: string | null;
    image_url: string | null;
    background_color: string;
    text_color: string;
    button_text: string | null;
    button_url: string | null;
    is_active: boolean;
    position: string;
    start_date: string | null;
    end_date: string | null;
}

interface CMSContextType {
    settings: SiteSettings;
    content: CMSContent[];
    banners: Banner[];
    loading: boolean;
    getContent: (section: string, blockKey: string) => CMSContent | undefined;
    getSetting: (key: string) => string;
    getActiveBanners: (position?: string) => Banner[];
    refreshCMS: () => Promise<void>;
}

const defaultSettings: SiteSettings = {
    site_name: 'AbbyGlow Essentials',
    site_tagline: 'Fresh. Clean. Glowing. After-wash, Olay shower gel, body splashes, vitamins & glow essentials — Accra with nationwide delivery.',
    site_logo: '/logo.png',
    contact_email: 'abbyglowessentials@gmail.com',
    contact_phone: '0256789875',
    contact_address: 'Accra, Ghana',
    social_facebook: 'https://www.facebook.com/share/1HRWTETrZ7/',
    social_instagram: 'https://www.instagram.com/abbyglowessentials_gh',
    social_twitter: '',
    social_tiktok: 'https://www.tiktok.com/@abbyglow.essentia_gh',
    social_snapchat: '',
    social_youtube: '',
    primary_color: '#0A0A0A',
    secondary_color: '#C8F542',
    currency: 'GHS',
    currency_symbol: 'GH₵',
};

const CMSContext = createContext<CMSContextType>({
    settings: defaultSettings,
    content: [],
    banners: [],
    loading: true,
    getContent: () => undefined,
    getSetting: () => '',
    getActiveBanners: () => [],
    refreshCMS: async () => { },
});

export function CMSProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
    const [content, setContent] = useState<CMSContent[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(false);

    /**
     * Load site_settings (key/value) and active banners through the public
     * GET shim. Defaults stay in place when nothing is stored or a request fails.
     */
    const fetchCMSData = async () => {
        setLoading(true);
        try {
            const [settingsRes, bannersRes] = await Promise.all([
                supabase.from('site_settings').select('key, value'),
                supabase
                    .from('banners')
                    .select('id, name, type, title, subtitle, image_url, background_color, text_color, button_text, button_url, is_active, position, start_date, end_date')
                    .eq('is_active', true),
            ]);

            if (!settingsRes.error && Array.isArray(settingsRes.data) && settingsRes.data.length > 0) {
                const merged: SiteSettings = { ...defaultSettings };
                for (const row of settingsRes.data as Array<{ key?: string; value?: unknown }>) {
                    if (!row?.key) continue;
                    const raw = row.value;
                    let text = '';
                    if (typeof raw === 'string') text = raw;
                    else if (typeof raw === 'number' || typeof raw === 'boolean') text = String(raw);
                    else if (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
                        const inner = (raw as Record<string, unknown>).value;
                        text = inner == null ? '' : String(inner);
                    }
                    if (text.trim()) merged[row.key] = text;
                }
                setSettings(merged);
            }

            if (!bannersRes.error && Array.isArray(bannersRes.data)) {
                setBanners(
                    (bannersRes.data as Array<Record<string, unknown>>).map((b) => ({
                        id: String(b.id),
                        name: String(b.name ?? ''),
                        type: String(b.type ?? 'promotional'),
                        title: (b.title as string | null) ?? null,
                        subtitle: (b.subtitle as string | null) ?? null,
                        image_url: (b.image_url as string | null) ?? null,
                        background_color: String(b.background_color ?? '#000000'),
                        text_color: String(b.text_color ?? '#FFFFFF'),
                        button_text: (b.button_text as string | null) ?? null,
                        button_url: (b.button_url as string | null) ?? null,
                        is_active: b.is_active !== false,
                        position: String(b.position ?? 'top'),
                        start_date: (b.start_date as string | null) ?? null,
                        end_date: (b.end_date as string | null) ?? null,
                    }))
                );
            }
        } catch (err) {
            console.error('CMS load failed, using defaults:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCMSData();
    }, []);

    const getContent = (section: string, blockKey: string): CMSContent | undefined => {
        return content.find(c => c.section === section && c.block_key === blockKey);
    };

    const getSetting = (key: string): string => {
        return settings[key] || defaultSettings[key] || '';
    };

    const getActiveBanners = (position?: string): Banner[] => {
        const now = new Date();
        return banners.filter(b => {
            if (position && b.position !== position) return false;
            if (b.start_date && new Date(b.start_date) > now) return false;
            if (b.end_date && new Date(b.end_date) < now) return false;
            return b.is_active;
        });
    };

    return (
        <CMSContext.Provider
            value={{
                settings,
                content,
                banners,
                loading,
                getContent,
                getSetting,
                getActiveBanners,
                refreshCMS: fetchCMSData,
            }}
        >
            {children}
        </CMSContext.Provider>
    );
}

export function useCMS() {
    const context = useContext(CMSContext);
    if (!context) {
        throw new Error('useCMS must be used within a CMSProvider');
    }
    return context;
}

export default CMSContext;
