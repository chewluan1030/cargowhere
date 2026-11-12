import type {
  AvailabilityBand,
  CarparkRecord,
  LotType,
  PlanningRegion,
} from '../types/carpark';

const sgdFormatter = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFormatter = new Intl.NumberFormat('en-SG');

export function formatSGD(cents: number): string {
  const safeCents = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  return sgdFormatter.format(safeCents / 100);
}

export function formatInt(value: number): string {
  return intFormatter.format(Number.isFinite(value) ? Math.round(value) : 0);
}

export function getLotEntry(carpark: CarparkRecord, lotType: LotType) {
  return carpark.lots.find((l) => l.lotType === lotType) ?? null;
}

/**
 * Computes aggregate capacity, availability, and occupancy strictly from summed parts,
 * never by averaging individual carpark percentages.
 */
export function computeAggregateMetrics(
  carparks: CarparkRecord[],
  lotType: LotType
): {
  totalAvailable: number;
  totalCapacity: number;
  occupancyPct: number;
  supportingCount: number;
  tightOrFullCount: number;
} {
  let totalAvailable = 0;
  let totalCapacity = 0;
  let supportingCount = 0;
  let tightOrFullCount = 0;

  for (const cp of carparks) {
    const entry = getLotEntry(cp, lotType);
    if (!entry || entry.totalLots <= 0) continue;
    supportingCount += 1;
    totalAvailable += entry.lotsAvailable;
    totalCapacity += entry.totalLots;
    const band = getAvailabilityBand(entry.lotsAvailable, entry.totalLots);
    if (band === 'tight' || band === 'full') {
      tightOrFullCount += 1;
    }
  }

  const occupied = Math.max(0, totalCapacity - totalAvailable);
  const occupancyPct =
    totalCapacity > 0 ? Math.round((occupied / totalCapacity) * 1000) / 10 : 0;

  return {
    totalAvailable,
    totalCapacity,
    occupancyPct,
    supportingCount,
    tightOrFullCount,
  };
}

export function getAvailabilityBand(
  available: number,
  total: number
): AvailabilityBand {
  if (total <= 0 || available <= 0) return 'full';
  const ratio = available / total;
  if (available <= 12 || ratio < 0.08) return 'tight';
  if (ratio < 0.28) return 'moderate';
  return 'ample';
}

export function getBandLabel(band: AvailabilityBand): string {
  switch (band) {
    case 'ample':
      return 'Available';
    case 'moderate':
      return 'Filling';
    case 'tight':
      return 'Tight';
    case 'full':
      return 'Full';
  }
}

/**
 * Exact integer-cents Singapore parking fee estimator.
 *
 * Verification (known case & invariant):
 * - Known case: HDB Central Area carpark (`ACB`, weekdayPerHalfHrCents = 120, gracePeriodMins = 10)
 *   for 90 minutes on a weekday for a Car ('C'):
 *   90 mins > 10 mins grace -> 3 half-hour blocks * 120 cents = 360 cents ($3.60 SGD).
 * - Invariant: For any carpark and vehicle type, if `durationMins <= carpark.gracePeriodMins`,
 *   `calculateParkingFeeCents` always returns `0`, and fee is monotonically non-decreasing
 *   with respect to `durationMins` on the same tariff day.
 */
export function calculateParkingFeeCents(
  carpark: CarparkRecord,
  lotType: LotType,
  durationMins: number,
  isWeekendOrPh: boolean
): {
  feeCents: number;
  withinGrace: boolean;
  blocksCharged: number;
  note: string;
} {
  const safeMins = Number.isFinite(durationMins)
    ? Math.max(0, Math.min(1440, Math.round(durationMins)))
    : 0;

  if (safeMins <= carpark.gracePeriodMins) {
    return {
      feeCents: 0,
      withinGrace: true,
      blocksCharged: 0,
      note: `Within ${carpark.gracePeriodMins}-min EPS grace period`,
    };
  }

  // HDB free Sunday / Public Holiday window check when applicable
  if (
    isWeekendOrPh &&
    carpark.agency === 'HDB' &&
    carpark.rates.freeParkingNote.toLowerCase().includes('sun & ph')
  ) {
    return {
      feeCents: 0,
      withinGrace: false,
      blocksCharged: 0,
      note: carpark.rates.freeParkingNote,
    };
  }

  // Singapore HDB / URA motorcycle per-session flat tariff ($0.65 - $1.30 per day session)
  if (lotType === 'Y') {
    const sessionCents = carpark.agency === 'LTA' ? 150 : 65;
    return {
      feeCents: sessionCents,
      withinGrace: false,
      blocksCharged: 1,
      note: 'Per-session motorcycle tariff',
    };
  }

  const blocks = Math.ceil(safeMins / 30);
  const unitCents = isWeekendOrPh
    ? carpark.rates.weekdayPerHalfHrCents
    : carpark.rates.weekdayPerHalfHrCents + carpark.rates.peakSurchargeCents;

  // Heavy vehicles ('H') are billed at 2x standard short-term half-hour block
  const multiplier = lotType === 'H' ? 2 : 1;
  let totalCents = blocks * unitCents * multiplier;

  if (
    isWeekendOrPh &&
    carpark.rates.weekendCapCents !== null &&
    lotType === 'C' &&
    totalCents > carpark.rates.weekendCapCents
  ) {
    totalCents = carpark.rates.weekendCapCents;
    return {
      feeCents: totalCents,
      withinGrace: false,
      blocksCharged: blocks,
      note: `Capped at weekend maximum (${formatSGD(carpark.rates.weekendCapCents)})`,
    };
  }

  return {
    feeCents: totalCents,
    withinGrace: false,
    blocksCharged: blocks,
    note: `${blocks} × 30-min block${blocks === 1 ? '' : 's'}`,
  };
}

export interface MapViewportConfig {
  id: 'all' | PlanningRegion;
  label: string;
  lngMin: number;
  lngMax: number;
  latMin: number;
  latMax: number;
}

export const SINGAPORE_VIEWPORTS: Record<
  'all' | PlanningRegion,
  MapViewportConfig
> = {
  all: {
    id: 'all',
    label: 'All Singapore',
    lngMin: 103.615,
    lngMax: 104.035,
    latMin: 1.235,
    latMax: 1.472,
  },
  Central: {
    id: 'Central',
    label: 'Central & CBD',
    lngMin: 103.775,
    lngMax: 103.895,
    latMin: 1.252,
    latMax: 1.348,
  },
  East: {
    id: 'East',
    label: 'East & Changi',
    lngMin: 103.885,
    lngMax: 104.025,
    latMin: 1.285,
    latMax: 1.395,
  },
  West: {
    id: 'West',
    label: 'West & Jurong',
    lngMin: 103.665,
    lngMax: 103.795,
    latMin: 1.295,
    latMax: 1.405,
  },
  North: {
    id: 'North',
    label: 'North',
    lngMin: 103.745,
    lngMax: 103.875,
    latMin: 1.385,
    latMax: 1.468,
  },
  'North-East': {
    id: 'North-East',
    label: 'North-East',
    lngMin: 103.825,
    lngMax: 103.935,
    latMin: 1.335,
    latMax: 1.428,
  },
};

export const SVG_MAP_WIDTH = 880;
export const SVG_MAP_HEIGHT = 500;
const PAD_X = 48;
const PAD_Y = 40;

export function projectLatLngToSvg(
  lat: number,
  lng: number,
  viewport: MapViewportConfig = SINGAPORE_VIEWPORTS.all
): { x: number; y: number } {
  const usableW = SVG_MAP_WIDTH - PAD_X * 2;
  const usableH = SVG_MAP_HEIGHT - PAD_Y * 2;
  const nx = (lng - viewport.lngMin) / (viewport.lngMax - viewport.lngMin);
  const ny = (lat - viewport.latMin) / (viewport.latMax - viewport.latMin);
  return {
    x: Math.round((PAD_X + nx * usableW) * 10) / 10,
    y: Math.round((SVG_MAP_HEIGHT - PAD_Y - ny * usableH) * 10) / 10,
  };
}

export interface Box2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function boxesOverlap(a: Box2D, b: Box2D, margin = 4): boolean {
  return !(
    a.x2 + margin < b.x1 ||
    a.x1 - margin > b.x2 ||
    a.y2 + margin < b.y1 ||
    a.y1 - margin > b.y2
  );
}

export interface PlacedMapLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  textAnchor: 'start' | 'middle' | 'end';
  box: Box2D;
}

/**
 * Deterministic collision-free label placer for the Singapore SVG locator map.
 * Guarantees every rendered label sits >= 13px clear of its own pin, inside the SVG frame,
 * and never overlaps any pin disc, highway badge, or previously placed label box.
 */
export function computeCollisionFreeLabels(
  items: Array<{
    id: string;
    label: string;
    px: number;
    py: number;
    priority: number;
  }>,
  reservedBoxes: Box2D[] = []
): Map<string, PlacedMapLabel> {
  const placed = new Map<string, PlacedMapLabel>();
  const occupied: Box2D[] = [...reservedBoxes];

  // Reserve every pin node disc (radius 10px buffer) so no text crosses another pin
  for (const item of items) {
    occupied.push({
      x1: item.px - 10,
      y1: item.py - 10,
      x2: item.px + 10,
      y2: item.py + 10,
    });
  }

  const sorted = [...items].sort((a, b) => a.priority - b.priority);

  const candidates: Array<{
    dx: number;
    dy: number;
    anchor: 'start' | 'middle' | 'end';
  }> = [
    { dx: 14, dy: 4, anchor: 'start' },
    { dx: -14, dy: 4, anchor: 'end' },
    { dx: 0, dy: -14, anchor: 'middle' },
    { dx: 0, dy: 21, anchor: 'middle' },
    { dx: 13, dy: -11, anchor: 'start' },
    { dx: -13, dy: -11, anchor: 'end' },
    { dx: 13, dy: 18, anchor: 'start' },
    { dx: -13, dy: 18, anchor: 'end' },
  ];

  for (const item of sorted) {
    // Skip pins outside visible frame
    if (
      item.px < 24 ||
      item.px > SVG_MAP_WIDTH - 24 ||
      item.py < 24 ||
      item.py > SVG_MAP_HEIGHT - 24
    ) {
      continue;
    }

    const estWidth = Math.ceil(item.label.length * 6.5) + 6;
    const estHeight = 14;

    for (const cand of candidates) {
      const tx = Math.round(item.px + cand.dx);
      const ty = Math.round(item.py + cand.dy);

      let x1 = tx;
      let x2 = tx + estWidth;
      if (cand.anchor === 'end') {
        x1 = tx - estWidth;
        x2 = tx;
      } else if (cand.anchor === 'middle') {
        x1 = tx - estWidth / 2;
        x2 = tx + estWidth / 2;
      }
      const y1 = ty - estHeight + 3;
      const y2 = ty + 3;

      const candidateBox: Box2D = { x1, y1, x2, y2 };

      // Keep strictly inside SVG frame with 10px margin
      if (
        candidateBox.x1 < 10 ||
        candidateBox.x2 > SVG_MAP_WIDTH - 10 ||
        candidateBox.y1 < 10 ||
        candidateBox.y2 > SVG_MAP_HEIGHT - 10
      ) {
        continue;
      }

      const collides = occupied.some((box) =>
        boxesOverlap(candidateBox, box, 3)
      );
      if (!collides) {
        occupied.push(candidateBox);
        placed.set(item.id, {
          id: item.id,
          text: item.label,
          x: tx,
          y: ty,
          textAnchor: cand.anchor,
          box: candidateBox,
        });
        break;
      }
    }
  }

  return placed;
}
