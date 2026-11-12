export type Agency = 'HDB' | 'LTA' | 'URA';

export type LotType = 'C' | 'Y' | 'H';

export type PlanningRegion =
  | 'Central'
  | 'East'
  | 'West'
  | 'North'
  | 'North-East';

export type AvailabilityBand = 'ample' | 'moderate' | 'tight' | 'full';

export type CarparkStructure =
  | 'Multi-storey (MSCP)'
  | 'Basement'
  | 'Surface'
  | 'Mechanised';

export type PaymentSystem = 'EPS (OBU / CashCard)' | 'Parking.sg / Coupon';

export interface CarparkLotInfo {
  lotType: LotType;
  totalLots: number;
  lotsAvailable: number;
}

export interface HourlyTrendPoint {
  hourLabel: string;
  availableCars: number;
  occupancyPct: number;
}

export interface CarparkRates {
  /** Weekday rate per 30-minute block in Singapore cents */
  weekdayPerHalfHrCents: number;
  /** Peak or Central Area surcharge per 30-minute block in Singapore cents */
  peakSurchargeCents: number;
  /** Optional daily/weekend cap in Singapore cents */
  weekendCapCents: number | null;
  /** Human-readable rate string */
  rateSummary: string;
  /** Free parking eligibility rule */
  freeParkingNote: string;
}

export interface CarparkRecord {
  id: string;
  name: string;
  address: string;
  agency: Agency;
  region: PlanningRegion;
  planningArea: string;
  expresswayExit: string;
  lat: number;
  lng: number;
  svy21: {
    x: number;
    y: number;
  };
  structure: CarparkStructure;
  paymentSystem: PaymentSystem;
  gantryHeightM: number;
  gracePeriodMins: number;
  evChargers: number;
  rates: CarparkRates;
  lots: CarparkLotInfo[];
  hourlyHistory: HourlyTrendPoint[];
  updatedAtIso: string;
}

/**
 * Backend integration contract compatible with data.gov.sg & LTA DataMall adapters
 */
export interface CarparkFeedResponse {
  timestamp: string;
  source: 'local-simulator' | 'remote-api';
  pollingIntervalSeconds: number;
  items: CarparkRecord[];
}

export interface ActiveParkingSession {
  carparkId: string;
  lotType: LotType;
  deckAndLot: string;
  startedAtMs: number;
  plannedDurationMins: number;
}

export type FeedDiagnosticMode = 'normal' | 'slow-network' | 'upstream-error';
