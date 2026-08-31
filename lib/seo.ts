import type { Metadata } from 'next';

export const SITE_NAME = 'AbbyGlow Essentials';
export const SITE_SHORT_NAME = 'AbbyGlow';
export const SITE_TAGLINE = 'Fresh. Clean. Glowing.';
export const SITE_DOMAIN = 'abbyglow.shop';
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || `https://${SITE_DOMAIN}`).replace(/\/+$/, '');
export const SITE_DESCRIPTION =
  'AbbyGlow Essentials — authentic bath and body essentials in Accra, Ghana. After-wash products, Olay shower gel, body splashes, skincare soaps, vitamins, and glow essentials with nationwide delivery.';
export const SITE_PHONE: string = process.env.NEXT_PUBLIC_CONTACT_PHONE || '0256789875';
export const SITE_PHONE_SECONDARY: string = process.env.NEXT_PUBLIC_CONTACT_PHONE_SECONDARY || '';

export function toWhatsAppE164(localNumber: string): string {
  const digits = localNumber.replace(/\D/g, '');
  if (digits.startsWith('233')) return digits;
  return `233${digits.replace(/^0/, '')}`;
}

export const SITE_WHATSAPP_NUMBERS = [SITE_PHONE, SITE_PHONE_SECONDARY].filter(Boolean);

export function whatsAppUrl(localNumber: string): string {
  return `https://wa.me/${toWhatsAppE164(localNumber)}`;
}

export function formatLocalPhone(localNumber: string): string {
  const digits = localNumber.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return localNumber;
}
export const SITE_EMAIL = process.env.ADMIN_EMAIL || '';
export const SITE_LOCALE = 'en_GH';
export const DEFAULT_OG_IMAGE = '/og-image.png';

export const DEFAULT_KEYWORDS = [
  'AbbyGlow Essentials',
  'AbbyGlow Essentials Ghana',
  'bath and body Ghana',
  'Olay shower gel Accra',
  'body splash Ghana',
  'after wash products',
  'skincare soap Accra',
  'vitamins and glow essentials',
  'nationwide delivery Ghana',
  'AbbyGlow Essentials shop',
];

export const SOCIAL_PROFILES = {
  instagram:
    process.env.NEXT_PUBLIC_INSTAGRAM_URL ||
    'https://www.instagram.com/abbyglowessentials_gh',
  tiktok:
    process.env.NEXT_PUBLIC_TIKTOK_URL ||
    'https://www.tiktok.com/@abbyglow.essentia_gh',
  facebook:
    process.env.NEXT_PUBLIC_FACEBOOK_URL ||
    'https://www.facebook.com/share/1HRWTETrZ7/',
};

type PageSeoInput = {
  title: string;
  description?: string;
  path?: string;
  keywords?: readonly string[];
  ogImage?: string;
  ogType?: 'website' | 'article';
  noindex?: boolean;
  publishedTime?: string;
  author?: string;
};

export function absoluteUrl(path = ''): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildPageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = '/',
  keywords = [],
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  noindex = false,
  publishedTime,
  author,
}: PageSeoInput): Metadata {
  const canonical = absoluteUrl(path);
  const fullTitle = title.includes(SITE_SHORT_NAME) ? title : `${title} | ${SITE_SHORT_NAME}`;
  const resolvedOgImage = absoluteUrl(ogImage);
  const mergedKeywords = [...new Set([...keywords, ...DEFAULT_KEYWORDS])];

  const metadata: Metadata = {
    title: fullTitle,
    description,
    keywords: mergedKeywords,
    authors: author ? [{ name: author }] : [{ name: SITE_SHORT_NAME }],
    creator: SITE_SHORT_NAME,
    publisher: SITE_SHORT_NAME,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical },
    openGraph: {
      type: ogType,
      locale: SITE_LOCALE,
      url: canonical,
      title: fullTitle,
      description,
      siteName: SITE_SHORT_NAME,
      images: [{ url: resolvedOgImage, width: 1200, height: 630, alt: fullTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [resolvedOgImage],
    },
    robots: noindex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
          },
        },
  };

  if (ogType === 'article' && publishedTime) {
    metadata.openGraph = {
      ...metadata.openGraph,
      type: 'article',
      publishedTime,
    };
  }

  return metadata;
}

export const STATIC_PAGE_SEO = {
  home: {
    title: 'AbbyGlow Essentials — Bath & Body Essentials in Accra, Ghana',
    description: SITE_DESCRIPTION,
    path: '/',
    keywords: ['AbbyGlow Essentials Accra', 'bath and body Ghana', SITE_TAGLINE],
  },
  shop: {
    title: 'Shop Bath & Body Essentials',
    description:
      'Browse authentic after-wash products, Olay shower gel, body splashes, skincare soaps, and vitamins at AbbyGlow Essentials with nationwide delivery.',
    path: '/shop',
    keywords: ['Olay shower gel Ghana', 'body splash Accra', 'after wash products'],
  },
  categories: {
    title: 'Shop by Category',
    description:
      'Explore AbbyGlow Essentials — after-wash, shower gel, body splashes, soaps, vitamins, and glow essentials.',
    path: '/categories',
    keywords: ['bath and body categories Ghana', 'AbbyGlow Essentials categories'],
  },
  about: {
    title: 'About AbbyGlow Essentials',
    description:
      'AbbyGlow Essentials is a retail brand for authentic bath and body essentials in Accra, Ghana — after-wash, Olay shower gel, body splashes, soaps, vitamins, and glow products.',
    path: '/about',
    keywords: ['about AbbyGlow Essentials', 'bath and body Accra'],
  },
  contact: {
    title: 'Contact AbbyGlow Essentials',
    description:
      'Contact AbbyGlow Essentials in Accra, Ghana. WhatsApp 0256789875 for orders, bath and body product questions, and nationwide delivery support.',
    path: '/contact',
    keywords: ['contact AbbyGlow Essentials', 'AbbyGlow WhatsApp', 'bath and body Accra'],
  },
  blog: {
    title: 'Blog & Glow Tips',
    description:
      'Bath and body tips, product updates, and freshness guides from AbbyGlow Essentials — after-wash, shower gel, body splashes, and glow essentials.',
    path: '/blog',
    keywords: ['AbbyGlow Essentials blog', 'bath and body tips Ghana', 'skincare Ghana'],
  },
  faqs: {
    title: 'Frequently Asked Questions',
    description:
      'FAQs about ordering bath and body essentials at AbbyGlow Essentials — shipping across Ghana, Mobile Money payments, returns, and product authenticity.',
    path: '/faqs',
    keywords: ['AbbyGlow Essentials FAQs', 'nationwide delivery Ghana', 'Mobile Money checkout'],
  },
  privacy: {
    title: 'Privacy Policy',
    description: 'Read how AbbyGlow Essentials collects, uses, and protects your personal information.',
    path: '/privacy',
  },
  terms: {
    title: 'Terms & Conditions',
    description: 'Terms and conditions for shopping at AbbyGlow Essentials.',
    path: '/terms',
  },
  shipping: {
    title: 'Shipping & Nationwide Delivery',
    description:
      'Nationwide delivery for AbbyGlow Essentials bath and body orders from Accra across Ghana. Delivery timelines and shipping policies.',
    path: '/shipping',
    keywords: ['nationwide delivery Ghana', 'AbbyGlow Essentials shipping', 'Accra delivery'],
  },
  returns: {
    title: 'Returns & Refunds',
    description: 'Learn about returns, exchanges, and refund policies at AbbyGlow Essentials.',
    path: '/returns',
    keywords: ['AbbyGlow Essentials returns policy', 'refunds Ghana'],
  },
} as const;

export function organizationSchema() {
  const sameAs = Object.values(SOCIAL_PROFILES).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_SHORT_NAME,
    legalName: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/logo.png'),
    description: SITE_DESCRIPTION,
    slogan: SITE_TAGLINE,
    ...(SITE_EMAIL ? { email: SITE_EMAIL } : {}),
    ...(SITE_PHONE ? { telephone: `+233${SITE_PHONE.replace(/^0/, '')}` } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Accra',
      addressRegion: 'Greater Accra',
      addressCountry: 'GH',
    },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_SHORT_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { '@type': 'Organization', name: SITE_SHORT_NAME },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/shop?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function localBusinessSchema() {
  const sameAs = Object.values(SOCIAL_PROFILES).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: SITE_NAME,
    slogan: SITE_TAGLINE,
    image: absoluteUrl(DEFAULT_OG_IMAGE),
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    ...(SITE_PHONE ? { telephone: `+233${SITE_PHONE.replace(/^0/, '')}` } : {}),
    priceRange: 'GH₵',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Accra',
      addressRegion: 'Greater Accra',
      addressCountry: 'GH',
    },
    areaServed: {
      '@type': 'Country',
      name: 'Ghana',
    },
    knowsAbout: [
      'After-wash products',
      'Olay shower gel',
      'Body splashes',
      'Skincare soaps',
      'Vitamins and glow essentials',
      'Bath and body care',
    ],
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '09:00',
      closes: '18:00',
    },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function productSchema(product: {
  name: string;
  description: string;
  image: string;
  slug: string;
  price: number;
  currency?: string;
  sku?: string;
  inStock?: boolean;
  brand?: string;
  category?: string;
}) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    sku: product.sku || product.slug,
    brand: { '@type': 'Brand', name: product.brand || SITE_SHORT_NAME },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/product/${product.slug}`),
      priceCurrency: product.currency || 'GHS',
      price: product.price,
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: SITE_SHORT_NAME },
    },
  };

  if (product.category) schema.category = product.category;
  return schema;
}
