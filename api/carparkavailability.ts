import type { VercelCompatibleRequest, VercelCompatibleResponse } from './health.ts';

// LTA DataMall v2 Carpark Availability item structure
export interface LTACarParkItem {
  CarParkID: string;
  Area?: string;
  Development?: string;
  Location?: string; // e.g. "1.304 103.832" or "1.295, 103.858"
  AvailableLots?: number | string;
  LotType?: string; // 'C' (Cars), 'Y' (Motorcycles), 'H' (Heavy Vehicles)
  Agency?: 'HDB' | 'LTA' | 'URA' | string;
}

export interface LTACarParkResponse {
  'odata.metadata'?: string;
  value: LTACarParkItem[];
}

const LTA_ENDPOINT = 'https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2';

/**
 * Serverless handler for /api/carparkavailability
 * Connects to LTA DataMall CarParkAvailabilityv2 using process.env.LTA_ACCOUNT_KEY
 */
export default async function handler(req: VercelCompatibleRequest, res: VercelCompatibleResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');

  const ltaAccountKey = (
    process.env.LTA_ACCOUNT_KEY ||
    (req.headers?.['x-lta-account-key'] as string) ||
    ''
  ).trim();

  if (!ltaAccountKey) {
    return res.status(401).json({
      error: 'Missing LTA Account Key',
      message:
        'LTA_ACCOUNT_KEY environment variable is not configured. Set LTA_ACCOUNT_KEY in your server environment or .env file.',
      endpoint: LTA_ENDPOINT,
      requiredHeader: 'AccountKey: <LTA_ACCOUNT_KEY>',
      hint: 'Register for an AccountKey at https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html',
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    const ltaResponse = await fetch(LTA_ENDPOINT, {
      method: 'GET',
      headers: {
        AccountKey: ltaAccountKey,
        accept: 'application/json',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!ltaResponse.ok) {
      const errorText = await ltaResponse.text();
      return res.status(ltaResponse.status).json({
        error: 'LTA DataMall API responded with an error',
        status: ltaResponse.status,
        statusText: ltaResponse.statusText,
        upstreamDetails: errorText,
      });
    }

    const data = (await ltaResponse.json()) as LTACarParkResponse;
    const rawCarparks = Array.isArray(data?.value) ? data.value : [];

    // Return the live LTA raw feed as well as transformed metrics for easy consumption
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      source: 'LTA DataMall v2',
      endpoint: LTA_ENDPOINT,
      totalRecords: rawCarparks.length,
      carparks: rawCarparks,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown network failure';
    return res.status(502).json({
      error: 'Failed to fetch from LTA DataMall',
      message: errorMessage,
      endpoint: LTA_ENDPOINT,
      timestamp: new Date().toISOString(),
    });
  }
}
