import React, { useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import type { CarparkRecord, FeedDiagnosticMode } from '../types/carpark';
import { Button, Field, Surface } from './ui';

interface BackendContractViewProps {
  sampleCarpark: CarparkRecord;
  pollingSeconds: number;
  onPollingSecondsChange: (sec: number) => void;
  diagnosticMode: FeedDiagnosticMode;
  onDiagnosticModeChange: (mode: FeedDiagnosticMode) => void;
  onTriggerRefresh: () => void;
  isRefreshing: boolean;
}

const CONTRACT_SNIPPET = `// GET \${VITE_CARPARK_API_URL}/carparks/availability
// Compatible adapter over data.gov.sg (/v1/transport/carpark-availability)
// & LTA DataMall (CarParkAvailabilityv2 + URA Carparkita)

export interface CarparkFeedResponse {
  timestamp: string; // ISO-8601 SGT/UTC feed snapshot time
  source: 'local-simulator' | 'remote-api';
  pollingIntervalSeconds: number;
  items: Array<{
    id: string;              // e.g. "ACB", "BM29", "LTA-SUN", "U0042"
    name: string;
    address: string;
    agency: 'HDB' | 'LTA' | 'URA';
    region: 'Central' | 'East' | 'West' | 'North' | 'North-East';
    planningArea: string;
    expresswayExit: string;
    lat: number;             // WGS84 latitude
    lng: number;             // WGS84 longitude
    svy21: { x: number; y: number };
    structure: 'Multi-storey (MSCP)' | 'Basement' | 'Surface' | 'Mechanised';
    paymentSystem: 'EPS (OBU / CashCard)' | 'Parking.sg / Coupon';
    gantryHeightM: number;
    gracePeriodMins: number;
    evChargers: number;
    rates: {
      weekdayPerHalfHrCents: number;
      peakSurchargeCents: number;
      weekendCapCents: number | null;
      rateSummary: string;
      freeParkingNote: string;
    };
    lots: Array<{
      lotType: 'C' | 'Y' | 'H'; // Car, Motorcycle, Heavy Vehicle
      totalLots: number;
      lotsAvailable: number;
    }>;
    hourlyHistory: Array<{
      hourLabel: string;
      availableCars: number;
      occupancyPct: number;
    }>;
    updatedAtIso: string;
  }>;
}`;

export const BackendContractView: React.FC<BackendContractViewProps> = ({
  sampleCarpark,
  pollingSeconds,
  onPollingSecondsChange,
  diagnosticMode,
  onDiagnosticModeChange,
  onTriggerRefresh,
  isRefreshing,
}) => {
  const [copiedContract, setCopiedContract] = useState(false);
  const configuredUrl = (
    import.meta.env.VITE_CARPARK_API_URL as string | undefined
  )?.trim();

  const handleCopyContract = async () => {
    try {
      await navigator.clipboard.writeText(CONTRACT_SNIPPET);
      setCopiedContract(true);
      window.setTimeout(() => setCopiedContract(false), 2200);
    } catch {
      setCopiedContract(true);
      window.setTimeout(() => setCopiedContract(false), 2200);
    }
  };

  return (
    <div className="space-y-6">
      {/* Adapter Controls & Frontend State Harness */}
      <Surface className="divide-y divide-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-title font-semibold text-foreground">
              Backend integration adapter & feed controls
            </h2>
            <p className="text-xs text-muted">
              Configure polling cadence or test loading and upstream-timeout states before wiring your API
            </p>
          </div>
          <Button
            tone="primary"
            onClick={onTriggerRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {isRefreshing ? 'Polling feed…' : 'Test poll now'}
          </Button>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border/40 md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="p-5">
            <p className="text-xs text-muted">Active transport source</p>
            <p className="mt-1 text-body font-semibold text-foreground">
              {configuredUrl
                ? 'Remote REST endpoint'
                : 'In-browser Singapore simulator'}
            </p>
            <p className="mt-1 font-mono text-xs text-muted">
              {configuredUrl || 'VITE_CARPARK_API_URL="" (unset)'}
            </p>
          </div>

          <div className="p-5">
            <Field
              label="Auto-poll interval"
              htmlFor="poll-cadence-select"
              hint="data.gov.sg updates HDB gantry counts every 60 seconds."
            >
              <select
                id="poll-cadence-select"
                value={pollingSeconds}
                onChange={(e) => onPollingSecondsChange(Number(e.target.value))}
                className="min-h-11 w-full rounded-control border border-border/60 bg-surface px-3 text-body text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <option value={15}>Every 15 seconds</option>
                <option value={30}>Every 30 seconds</option>
                <option value={60}>Every 60 seconds</option>
                <option value={0}>Manual refresh only (paused)</option>
              </select>
            </Field>
          </div>

          <div className="p-5">
            <Field
              label="UI network state harness"
              htmlFor="diag-mode-select"
              hint="Verify skeleton loading and non-destructive error retention."
            >
              <select
                id="diag-mode-select"
                value={diagnosticMode}
                onChange={(e) =>
                  onDiagnosticModeChange(e.target.value as FeedDiagnosticMode)
                }
                className="min-h-11 w-full rounded-control border border-border/60 bg-surface px-3 text-body text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <option value="normal">Normal response (140 ms)</option>
                <option value="slow-network">
                  Slow mobile 4G (750 ms skeleton)
                </option>
                <option value="upstream-error">
                  Simulate 504 gateway timeout
                </option>
              </select>
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 text-xs text-muted md:grid-cols-3">
          <div>
            <p className="font-semibold text-foreground">
              1. HDB Carpark Availability
            </p>
            <p className="mt-1">
              Map <span className="font-mono text-foreground">carpark_number</span>,{' '}
              <span className="font-mono text-foreground">lot_type</span> (C/Y/H), and{' '}
              <span className="font-mono text-foreground">lots_available</span> from
              data.gov.sg <span className="font-mono text-foreground">/v1/transport/carpark-availability</span>, joined with HDB Carpark Information CSV (SVY21 X/Y converted to WGS84).
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">
              2. LTA DataMall v2
            </p>
            <p className="mt-1">
              Map <span className="font-mono text-foreground">CarParkID</span>,{' '}
              <span className="font-mono text-foreground">Development</span>,{' '}
              <span className="font-mono text-foreground">Location</span> (&quot;lat lng&quot;),{' '}
              <span className="font-mono text-foreground">AvailableLots</span>, and{' '}
              <span className="font-mono text-foreground">Agency</span> (HDB/LTA/URA).
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">
              3. Zero-refactor frontend switch
            </p>
            <p className="mt-1">
              Set <span className="font-mono text-foreground">VITE_CARPARK_API_URL</span> in{' '}
              <span className="font-mono text-foreground">.env</span> (e.g.{' '}
              <span className="font-mono text-foreground">/api</span>).{' '}
              <span className="font-mono text-foreground">src/services/carparkClient.ts</span>{' '}
              automatically switches from simulator to live HTTP polling.
            </p>
          </div>
        </div>
      </Surface>

      {/* TypeScript Contract & Live Record Payload */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-body font-semibold text-foreground">
              TypeScript endpoint contract
            </h3>
            <Button
              tone="quiet"
              onClick={handleCopyContract}
              className="min-h-9 px-3 text-xs"
            >
              {copiedContract ? (
                <>
                  <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Copied interface
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy TypeScript contract
                </>
              )}
            </Button>
          </div>
          <Surface inset className="overflow-x-auto p-4">
            <pre className="font-mono text-xs leading-relaxed text-foreground">
              <code>{CONTRACT_SNIPPET}</code>
            </pre>
          </Surface>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-body font-semibold text-foreground">
              Live record snapshot ({sampleCarpark.id})
            </h3>
            <span className="font-mono text-xs text-muted">
              GET /carparks/availability → items[0]
            </span>
          </div>
          <Surface inset className="overflow-x-auto p-4">
            <pre className="font-mono text-xs leading-relaxed text-foreground">
              <code>
                {JSON.stringify(
                  {
                    ...sampleCarpark,
                    hourlyHistory: sampleCarpark.hourlyHistory.slice(-3),
                  },
                  null,
                  2
                )}
              </code>
            </pre>
          </Surface>
        </div>
      </div>
    </div>
  );
};
