'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function HelpfulToggle() {
  const [wasHelpful, setWasHelpful] = useState<boolean | null>(null);

  return (
    <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Was this article helpful?</h3>
      {wasHelpful === null ? (
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => setWasHelpful(true)}
            className="flex-1 py-3 px-6 border-2 border-brand text-brand hover:bg-brand-dark hover:text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
          >
            <i className="ri-thumb-up-line mr-2"></i>
            Yes, it was helpful
          </button>
          <button
            onClick={() => setWasHelpful(false)}
            className="flex-1 py-3 px-6 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg font-semibold transition-colors whitespace-nowrap"
          >
            <i className="ri-thumb-down-line mr-2"></i>
            No, I need more help
          </button>
        </div>
      ) : (
        <div className="text-center">
          {wasHelpful ? (
            <>
              <div className="w-16 h-16 flex items-center justify-center bg-brand-soft rounded-full mx-auto mb-4">
                <i className="ri-check-line text-3xl text-brand"></i>
              </div>
              <p className="text-lg font-semibold text-gray-900 mb-2">
                Thanks for letting us know
              </p>
              <button
                onClick={() => setWasHelpful(null)}
                className="text-sm text-gray-500 hover:text-gray-900 underline"
              >
                Undo
              </button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 flex items-center justify-center bg-brand-soft rounded-full mx-auto mb-4">
                <i className="ri-customer-service-line text-3xl text-brand"></i>
              </div>
              <p className="text-lg font-semibold text-gray-900 mb-2">
                Sorry we couldn&apos;t help
              </p>
              <p className="text-gray-600 mb-4">
                Our support team is here for you.
              </p>
              <Link
                href="/support/ticket"
                className="inline-block bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Contact Support
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
