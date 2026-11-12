export type VercelCompatibleRequest = {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type VercelCompatibleResponse = {
  status: (code: number) => VercelCompatibleResponse;
  json: (data: unknown) => void;
  send?: (data: unknown) => void;
  setHeader: (name: string, value: string) => VercelCompatibleResponse;
};

export default function handler(req: VercelCompatibleRequest, res: VercelCompatibleResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  
  const hasLtaKey = Boolean(process.env.LTA_ACCOUNT_KEY && process.env.LTA_ACCOUNT_KEY.trim().length > 0);

  return res.status(200).json({
    status: 'ok',
    service: 'Singapore Carpark LTA DataMall Gateway',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime ? process.uptime() : 0),
    environment: {
      ltaAccountKeyConfigured: hasLtaKey,
      nodeVersion: process.version,
    },
    endpoints: {
      health: '/api/health',
      carparkAvailability: '/api/carparkavailability',
    },
  });
}
