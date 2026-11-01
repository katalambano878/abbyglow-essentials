import { randomBytes } from 'crypto';

// No R / H: payment references append -R<ts> / -H<ts> and strip them by regex.
const ORDER_ALPHABET = 'ABCDEFGHJKLMNPQSTUVWXYZ23456789';

export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ORDER_ALPHABET[bytes[i] % ORDER_ALPHABET.length];
  return out;
}

/** Order numbers stay prefix-compatible with existing tooling (ORD-<timestamp>-…) but are no longer guessable. */
export function generateOrderNumber(): string {
  return `ORD-${Date.now()}-${randomCode(6)}`;
}

export function generateTrackingNumber(): string {
  return `SLI-${randomCode(6)}`;
}
