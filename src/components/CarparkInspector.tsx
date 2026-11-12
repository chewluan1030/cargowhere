import React, { useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Car,
  Check,
  Copy,
  Navigation,
} from 'lucide-react';
import type { CarparkRecord, LotType } from '../types/carpark';
import {
  calculateParkingFeeCents,
  formatInt,
  formatSGD,
  getAvailabilityBand,
  getBandLabel,
} from '../utils/carparkMath';
import { Button, Field, Surface } from './ui';

interface CarparkInspectorProps {
  carpark: CarparkRecord;
  selectedLotType: LotType;
  isSaved: boolean;
  isActiveSessionHere: boolean;
  onToggleSave: (id: string) => void;
  onStartParkingSession: (
    carparkId: string,
    lotType: LotType,
    deckAndLot: string,
    plannedDurationMins: number
  ) => void;
  onBackMobile?: () => void;
}

const LOT_LABELS: Record<LotType, string> = {
  C: 'Cars (C)',
  Y: 'Motorcycles (Y)',
  H: 'Heavy vehicles (H)',
};

export const CarparkInspector: React.FC<CarparkInspectorProps> = ({
  carpark,
  selectedLotType,
  isSaved,
  isActiveSessionHere,
  onToggleSave,
  onStartParkingSession,
  onBackMobile,
}) => {
  const [durationMins, setDurationMins] = useState<number>(90);
  const [isWeekendOrPh, setIsWeekendOrPh] = useState<boolean>(false);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);
  const [showLogForm, setShowLogForm] = useState<boolean>(false);
  const [deckNote, setDeckNote] = useState<string>('Deck 3A · Lot 108');

  const feeEstimate = calculateParkingFeeCents(
    carpark,
    selectedLotType,
    durationMins,
    isWeekendOrPh
  );

  const carEntry = carpark.lots.find((l) => l.lotType === 'C');
  const chartMaxCapacity = Math.max(1, carEntry?.totalLots ?? 100);

  const handleCopyCoords = async () => {
    const text = `${carpark.lat.toFixed(4)}, ${carpark.lng.toFixed(4)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCoords(true);
      window.setTimeout(() => setCopiedCoords(false), 2200);
    } catch {
      setCopiedCoords(true);
      window.setTimeout(() => setCopiedCoords(false), 2200);
    }
  };

  // Pure SVG geometry for the 24-hour car availability bar/area chart (starts strictly at 0)
  const chartW = 500;
  const chartH = 168;
  const padL = 46;
  const padR = 14;
  const padT = 14;
  const padB = 28;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const pts = carpark.hourlyHistory;
  const barStep = pts.length > 0 ? plotW / pts.length : plotW;
  const barWidth = Math.max(8, Math.round(barStep * 0.62));

  return (
    <Surface className="divide-y divide-border/40">
      {/* Mobile Back bar */}
      {onBackMobile ? (
        <div className="px-4 py-2.5 lg:hidden">
          <Button tone="ghost" onClick={onBackMobile} className="min-h-9 px-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to carpark list
          </Button>
        </div>
      ) : null}

      {/* Header & Primary Actions */}
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-xs text-muted">
            <span className="font-medium text-foreground">{carpark.agency}</span>
            {' · '}
            <span>{carpark.planningArea}</span>
            {' · '}
            <span>Code </span>
            <span className="font-mono text-foreground">{carpark.id}</span>
          </p>
          <span className="text-xs text-muted tabular-nums">
            Updated{' '}
            {new Date(carpark.updatedAtIso).toLocaleTimeString('en-SG', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>

        <div>
          <h2 className="text-title font-semibold text-foreground">
            {carpark.name}
          </h2>
          <p className="mt-1 text-body text-muted">{carpark.address}</p>
          <p className="mt-1 text-xs text-muted">
            Approach via <span className="text-foreground">{carpark.expresswayExit}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            tone={isActiveSessionHere ? 'quiet' : 'primary'}
            onClick={() => setShowLogForm((prev) => !prev)}
          >
            <Car className="h-4 w-4" aria-hidden="true" />
            {isActiveSessionHere ? 'Parked here · Update bay' : 'Park here'}
          </Button>

          <Button
            tone="quiet"
            onClick={() => onToggleSave(carpark.id)}
            aria-pressed={isSaved}
          >
            <Bookmark
              className={`h-4 w-4 ${isSaved ? 'fill-current text-primary' : ''}`}
              aria-hidden="true"
            />
            {isSaved ? 'Saved' : 'Save carpark'}
          </Button>
        </div>

        {/* Inline Log Parked Car Form (parted by hairline, never a nested bordered box) */}
        {showLogForm ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onStartParkingSession(
                carpark.id,
                selectedLotType,
                deckNote.trim() || 'Level 2 · General bay',
                durationMins
              );
              setShowLogForm(false);
            }}
            className="mt-3 space-y-3 border-t border-border/40 pt-3"
          >
            <Field
              label="Deck, zone or lot number"
              htmlFor={`deck-note-${carpark.id}`}
              hint="Saved locally with entry timestamp so LotWatch SG tracks live accrued EPS charges."
            >
              <input
                id={`deck-note-${carpark.id}`}
                type="text"
                value={deckNote}
                onChange={(e) => setDeckNote(e.target.value)}
                placeholder="e.g. Deck 4A · Pillar B12"
                className="min-h-11 w-full rounded-control border border-border/60 bg-surface px-3 text-body text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" tone="primary">
                Start parking timer
              </Button>
              <Button
                type="button"
                tone="ghost"
                onClick={() => setShowLogForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      {/* Lot Breakdown across C / Y / H parted strictly by 1px rules */}
      <div className="grid grid-cols-1 divide-y divide-border/40 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {(['C', 'Y', 'H'] as LotType[]).map((lt) => {
          const info = carpark.lots.find((l) => l.lotType === lt);
          const isFocused = lt === selectedLotType;
          if (!info) {
            return (
              <div key={lt} className="p-4">
                <p className="text-xs text-muted">{LOT_LABELS[lt]}</p>
                <p className="mt-1 text-body font-medium text-muted">No bays</p>
                <p className="mt-0.5 text-xs text-muted">Not provisioned</p>
              </div>
            );
          }

          const band = getAvailabilityBand(info.lotsAvailable, info.totalLots);
          const bandWord = getBandLabel(band);
          const pctFree =
            info.totalLots > 0
              ? Math.round((info.lotsAvailable / info.totalLots) * 100)
              : 0;
          const wordColor =
            band === 'ample'
              ? 'text-primary'
              : band === 'moderate'
                ? 'text-accent'
                : 'text-danger';

          return (
            <div key={lt} className="p-4">
              <p className="text-xs text-muted">
                <span className={isFocused ? 'font-semibold text-foreground' : ''}>
                  {LOT_LABELS[lt]}
                </span>
              </p>
              <p className="mt-1 text-title font-semibold text-foreground tabular-nums">
                {formatInt(info.lotsAvailable)}{' '}
                <span className="text-xs font-normal text-muted">
                  / {formatInt(info.totalLots)}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted tabular-nums">
                <span className={`font-medium ${wordColor}`}>{bandWord}</span>
                {' · '}
                {pctFree}% open
              </p>
            </div>
          );
        })}
      </div>

      {/* 24-Hour Passenger Car Availability Curve */}
      <div className="space-y-2.5 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-body font-semibold text-foreground">
            24-hour car bay availability
          </h3>
          <span className="text-xs text-muted tabular-nums">
            Capacity {formatInt(chartMaxCapacity)} lots · 2-hour intervals
          </span>
        </div>

        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`24-hour available car lots chart for ${carpark.name}`}
        >
          {/* Y-axis horizontal gridlines at 0%, 50%, 100% */}
          {[0, 0.5, 1].map((frac) => {
            const y = Math.round(padT + plotH * (1 - frac));
            const tickVal = Math.round(chartMaxCapacity * frac);
            return (
              <g key={`grid-${frac}`}>
                <line
                  x1={padL}
                  y1={y}
                  x2={chartW - padR}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeOpacity={frac === 0 ? 0.45 : 0.2}
                  strokeWidth={1}
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={10.5}
                  fill="var(--color-muted)"
                  className="carto-halo tabular-nums"
                >
                  {formatInt(tickVal)}
                </text>
              </g>
            );
          })}

          {/* Columns starting strictly at y = 0 baseline */}
          {pts.map((pt, idx) => {
            const h = Math.max(
              2,
              Math.round((pt.availableCars / chartMaxCapacity) * plotH)
            );
            const x = Math.round(
              padL + idx * barStep + (barStep - barWidth) / 2
            );
            const y = padT + plotH - h;
            const isNow = idx === pts.length - 1;
            const band = getAvailabilityBand(
              pt.availableCars,
              chartMaxCapacity
            );
            const barFill = isNow
              ? band === 'tight' || band === 'full'
                ? 'var(--color-danger)'
                : 'var(--color-primary)'
              : 'color-mix(in oklab, var(--color-primary) 42%, var(--color-surface))';

            return (
              <g key={pt.hourLabel}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  rx={2}
                  fill={barFill}
                />
                {/* Show 6 evenly spaced time ticks */}
                {idx % 2 === 1 ? (
                  <text
                    x={Math.round(x + barWidth / 2)}
                    y={chartH - 7}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontWeight={isNow ? 600 : 400}
                    fill={
                      isNow ? 'var(--color-foreground)' : 'var(--color-muted)'
                    }
                    className="carto-halo"
                  >
                    {pt.hourLabel}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        <p className="text-xs text-muted">
          Available passenger car lots measured every 2 hours over the past 24 hours; rightmost bar reflects current gantry count.
        </p>
      </div>

      {/* Interactive EPS / Parking.sg Fee Estimator */}
      <div className="space-y-3.5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-body font-semibold text-foreground">
            Parking fee estimator
          </h3>
          <div
            role="group"
            aria-label="Tariff schedule"
            className="flex flex-wrap items-center gap-1"
          >
            <button
              type="button"
              onClick={() => setIsWeekendOrPh(false)}
              aria-pressed={!isWeekendOrPh}
              className={`min-h-8 whitespace-nowrap rounded-control px-2.5 text-xs font-medium ${
                !isWeekendOrPh
                  ? 'border border-primary bg-primary text-primary-foreground'
                  : 'border border-border/50 bg-surface text-foreground hover:bg-background'
              }`}
            >
              Weekday
            </button>
            <button
              type="button"
              onClick={() => setIsWeekendOrPh(true)}
              aria-pressed={isWeekendOrPh}
              className={`min-h-8 whitespace-nowrap rounded-control px-2.5 text-xs font-medium ${
                isWeekendOrPh
                  ? 'border border-primary bg-primary text-primary-foreground'
                  : 'border border-border/50 bg-surface text-foreground hover:bg-background'
              }`}
            >
              Sun / PH
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-display font-semibold text-foreground tabular-nums">
              {formatSGD(feeEstimate.feeCents)}
            </p>
            <p className="text-xs text-muted">
              {feeEstimate.note} · {LOT_LABELS[selectedLotType]}
            </p>
          </div>
          <div className="text-right text-xs text-muted tabular-nums">
            Duration:{' '}
            <span className="font-semibold text-foreground">
              {Math.floor(durationMins / 60) > 0
                ? `${Math.floor(durationMins / 60)}h `
                : ''}
              {durationMins % 60}m
            </span>
          </div>
        </div>

        <Field
          label="Planned stay duration (10 mins to 6 hours)"
          htmlFor={`duration-slider-${carpark.id}`}
        >
          <input
            id={`duration-slider-${carpark.id}`}
            type="range"
            min={10}
            max={360}
            step={10}
            value={durationMins}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (Number.isFinite(val)) {
                setDurationMins(Math.max(10, Math.min(360, val)));
              }
            }}
            className="h-2 w-full cursor-pointer accent-primary"
          />
        </Field>

        <div className="space-y-1 text-xs text-muted">
          <p>
            <span className="font-medium text-foreground">Published tariff:</span>{' '}
            {carpark.rates.rateSummary}
          </p>
          <p>
            <span className="font-medium text-foreground">Grace & free window:</span>{' '}
            {carpark.rates.freeParkingNote}
          </p>
        </div>
      </div>

      {/* Practical Gantry & Hardware Specs */}
      <div className="space-y-3 p-4 sm:p-5">
        <h3 className="text-body font-semibold text-foreground">
          Gantry & deck specifications
        </h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-xs sm:grid-cols-2">
          <div className="flex items-baseline justify-between border-b border-border/30 pb-2">
            <dt className="text-muted">Height clearance</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {carpark.gantryHeightM.toFixed(2)} m
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-b border-border/30 pb-2">
            <dt className="text-muted">Deck structure</dt>
            <dd className="font-medium text-foreground">{carpark.structure}</dd>
          </div>
          <div className="flex items-baseline justify-between border-b border-border/30 pb-2">
            <dt className="text-muted">Gantry system</dt>
            <dd className="font-medium text-foreground">
              {carpark.paymentSystem}
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-b border-border/30 pb-2">
            <dt className="text-muted">EV charging points</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {carpark.evChargers > 0 ? `${carpark.evChargers} bays` : 'None'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between pb-1">
            <dt className="text-muted">SVY21 (X, Y)</dt>
            <dd className="font-mono text-foreground">
              {carpark.svy21.x}, {carpark.svy21.y}
            </dd>
          </div>
          <div className="flex items-baseline justify-between pb-1">
            <dt className="text-muted">WGS84</dt>
            <dd className="font-mono text-foreground">
              {carpark.lat.toFixed(4)}, {carpark.lng.toFixed(4)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button
            tone="quiet"
            onClick={handleCopyCoords}
            className="min-h-9 px-3 text-xs"
          >
            {copiedCoords ? (
              <>
                <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Copied WGS84 coordinates
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copy GPS coordinates
              </>
            )}
          </Button>

          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1 text-xs text-muted"
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
            {carpark.region} Region
          </span>
        </div>
      </div>
    </Surface>
  );
};
