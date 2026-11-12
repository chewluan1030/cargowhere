import { INITIAL_SINGAPORE_CARPARKS } from '../data/singaporeCarparks';
import type {
  ActiveParkingSession,
  CarparkFeedResponse,
  CarparkRecord,
  FeedDiagnosticMode,
} from '../types/carpark';

const STORAGE_KEYS = {
  SAVED_IDS: 'lotwatch_sg_saved_v1',
  ACTIVE_SESSION: 'lotwatch_sg_session_v1',
  FEED_STATE: 'lotwatch_sg_feed_v1',
};

const DEFAULT_SAVED_IDS = ['ACB', 'LTA-SUN', 'TP12'];

export function loadSavedCarparkIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.SAVED_IDS);
    if (!raw) return DEFAULT_SAVED_IDS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed;
    }
    return DEFAULT_SAVED_IDS;
  } catch {
    return DEFAULT_SAVED_IDS;
  }
}

export function persistSavedCarparkIds(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.SAVED_IDS, JSON.stringify(ids));
  } catch {
    // Ignore storage quota or sandbox restrictions gracefully
  }
}

export function loadActiveParkingSession(): ActiveParkingSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
    if (!raw) {
      // Seed one realistic active session opened mid-story (started 42 mins ago at Toa Payoh TP12)
      const seeded: ActiveParkingSession = {
        carparkId: 'TP12',
        lotType: 'C',
        deckAndLot: 'Basement 1 · Lot 214',
        startedAtMs: Date.now() - 42 * 60 * 1000,
        plannedDurationMins: 90,
      };
      persistActiveParkingSession(seeded);
      return seeded;
    }
    if (raw === 'none') return null;
    const parsed = JSON.parse(raw) as Partial<ActiveParkingSession>;
    if (
      parsed &&
      typeof parsed.carparkId === 'string' &&
      (parsed.lotType === 'C' ||
        parsed.lotType === 'Y' ||
        parsed.lotType === 'H') &&
      typeof parsed.deckAndLot === 'string' &&
      typeof parsed.startedAtMs === 'number' &&
      typeof parsed.plannedDurationMins === 'number'
    ) {
      return parsed as ActiveParkingSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function persistActiveParkingSession(
  session: ActiveParkingSession | null
): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.ACTIVE_SESSION,
      session ? JSON.stringify(session) : 'none'
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function resetAllLocalState(): {
  carparks: CarparkRecord[];
  savedIds: string[];
  session: ActiveParkingSession | null;
} {
  try {
    window.localStorage.removeItem(STORAGE_KEYS.SAVED_IDS);
    window.localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, 'none');
    window.localStorage.removeItem(STORAGE_KEYS.FEED_STATE);
  } catch {
    // Ignore storage restrictions
  }
  const fresh = INITIAL_SINGAPORE_CARPARKS.map((cp) => ({
    ...cp,
    updatedAtIso: new Date().toISOString(),
  }));
  return {
    carparks: fresh,
    savedIds: DEFAULT_SAVED_IDS,
    session: null,
  };
}

/**
 * Applies a realistic gantry arrival/departure tick to the client-side feed
 * when no remote backend (`VITE_CARPARK_API_URL`) is wired yet.
 */
export function advanceSimulatedFeed(
  current: CarparkRecord[],
  seedTick: number
): CarparkRecord[] {
  const nowIso = new Date().toISOString();
  return current.map((cp, index) => {
    // Deterministic pseudo-random wave combined with index so updates look organic and repeatable
    const phase = Math.sin(seedTick * 1.7 + index * 2.3);
    const updatedLots = cp.lots.map((lot) => {
      const maxSwing = Math.max(2, Math.round(lot.totalLots * 0.018));
      const delta = Math.round(phase * maxSwing);
      const nextAvail = Math.max(
        0,
        Math.min(lot.totalLots, lot.lotsAvailable + delta)
      );
      return {
        ...lot,
        lotsAvailable: nextAvail,
      };
    });

    const carEntry = updatedLots.find((l) => l.lotType === 'C');
    const updatedHistory = cp.hourlyHistory.map((pt, hIdx) => {
      if (hIdx !== cp.hourlyHistory.length - 1 || !carEntry) return pt;
      const occupied = carEntry.totalLots - carEntry.lotsAvailable;
      return {
        ...pt,
        availableCars: carEntry.lotsAvailable,
        occupancyPct:
          carEntry.totalLots > 0
            ? Math.round((occupied / carEntry.totalLots) * 100)
            : 0,
      };
    });

    return {
      ...cp,
      lots: updatedLots,
      hourlyHistory: updatedHistory,
      updatedAtIso: nowIso,
    };
  });
}

/**
 * Primary frontend data client.
 * When `VITE_CARPARK_API_URL` is set later during backend integration,
 * calls `GET ${VITE_CARPARK_API_URL}/carparks/availability`.
 * Otherwise serves and updates the stateful client-side Singapore feed.
 */
export async function fetchCarparkFeed(options: {
  currentRecords: CarparkRecord[];
  tick: number;
  diagnosticMode?: FeedDiagnosticMode;
}): Promise<CarparkFeedResponse> {
  const { currentRecords, tick, diagnosticMode = 'normal' } = options;

  if (diagnosticMode === 'slow-network') {
    await new Promise((resolve) => setTimeout(resolve, 750));
  } else {
    await new Promise((resolve) => setTimeout(resolve, 140));
  }

  if (diagnosticMode === 'upstream-error') {
    throw new Error(
      'Upstream LTA / HDB gantry feed timed out after 5,000 ms. Showing last verified snapshot.'
    );
  }

  const configuredBaseUrl = (
    import.meta.env.VITE_CARPARK_API_URL as string | undefined
  )?.trim();

  if (configuredBaseUrl) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 6000);
    try {
      const endpoint = `${configuredBaseUrl.replace(/\/$/, '')}/carparks/availability`;
      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Carpark backend responded with HTTP ${res.status}.`);
      }
      const payload = (await res.json()) as CarparkFeedResponse;
      return payload;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  const nextRecords =
    tick === 0
      ? currentRecords
      : advanceSimulatedFeed(currentRecords, tick);

  return {
    timestamp: new Date().toISOString(),
    source: 'local-simulator',
    pollingIntervalSeconds: 30,
    items: nextRecords,
  };
}
