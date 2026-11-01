'use client';

import { useState } from 'react';

interface Props {
  url: string;
  title: string;
}

export default function ShareButtons({ url, title }: Props) {
  const [copied, setCopied] = useState(false);

  const text = encodeURIComponent(title);
  const link = encodeURIComponent(url);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  const btn =
    'w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-brand-soft transition-colors cursor-pointer';

  return (
    <div>
      <div className="flex gap-3">
        <a
          href={`https://wa.me/?text=${text}%20${link}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on WhatsApp"
          className={btn}
        >
          <i className="ri-whatsapp-line text-gray-600"></i>
        </a>
        <a
          href={`https://twitter.com/intent/tweet?text=${text}&url=${link}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on X"
          className={btn}
        >
          <i className="ri-twitter-x-fill text-gray-600"></i>
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${link}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Facebook"
          className={btn}
        >
          <i className="ri-facebook-fill text-gray-600"></i>
        </a>
        <button type="button" onClick={copyLink} aria-label="Copy link" className={btn}>
          <i className={`${copied ? 'ri-check-line text-green-600' : 'ri-link text-gray-600'}`}></i>
        </button>
      </div>
      {copied && <p className="mt-2 text-xs text-green-700" role="status">Link copied</p>}
    </div>
  );
}
