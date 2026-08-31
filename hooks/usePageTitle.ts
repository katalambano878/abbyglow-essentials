'use client';

import { useEffect } from 'react';

const SITE_NAME = 'AbbyGlow Essentials';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title
      ? `${title} | ${SITE_NAME}`
      : `${SITE_NAME} | Shop Online in Accra, Ghana`;
  }, [title]);
}
