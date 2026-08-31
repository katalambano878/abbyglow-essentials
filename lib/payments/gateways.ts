export type PaymentGateway = 'moolre' | 'hubtel';

export type GatewayInfo = {
  id: PaymentGateway;
  label: string;
  configured: boolean;
};

export function isMoolreConfigured(): boolean {
  return Boolean(
    process.env.MOOLRE_API_USER &&
      process.env.MOOLRE_API_PUBKEY &&
      process.env.MOOLRE_ACCOUNT_NUMBER
  );
}

export function isHubtelConfigured(): boolean {
  return Boolean(
    process.env.HUBTEL_CLIENT_ID &&
      process.env.HUBTEL_CLIENT_SECRET &&
      process.env.HUBTEL_MERCHANT_ACCOUNT_NUMBER
  );
}

export function listConfiguredGateways(): GatewayInfo[] {
  const all: GatewayInfo[] = [
    { id: 'moolre', label: 'Moolre (Mobile Money / Card)', configured: isMoolreConfigured() },
    { id: 'hubtel', label: 'Hubtel (Mobile Money / Card)', configured: isHubtelConfigured() },
  ];
  return all.filter((g) => g.configured);
}

export function isGatewayConfigured(gateway: string): boolean {
  if (gateway === 'moolre') return isMoolreConfigured();
  if (gateway === 'hubtel') return isHubtelConfigured();
  return false;
}

export function parseGateway(value: unknown): PaymentGateway | null {
  const g = String(value || '').toLowerCase();
  if (g === 'moolre' || g === 'hubtel') return g;
  return null;
}
