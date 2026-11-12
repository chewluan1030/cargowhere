import React, { useMemo, useState } from 'react';
import type {
  CarparkRecord,
  LotType,
  PlanningRegion,
} from '../types/carpark';
import {
  computeAggregateMetrics,
  formatInt,
  getAvailabilityBand,
  getBandLabel,
  getLotEntry,
} from '../utils/carparkMath';
import { Button, Surface } from './ui';

interface CorridorAnalyticsViewProps {
  carparks: CarparkRecord[];
  selectedLotType: LotType;
  onInspectCarpark: (id: string) => void;
}

type HistoryWindow = '6h' | '12h' | '24h';

const REGIONS: PlanningRegion[] = [
  'Central',
  'East',
  'West',
  'North',
  'North-East',
];

export const CorridorAnalyticsView: React.FC<CorridorAnalyticsViewProps> = ({
  carparks,
  selectedLotType,
  onInspectCarpark,
}) => {
  const [windowSpan, setWindowSpan] = useState<HistoryWindow>('24h');

  const sliceCount = windowSpan === '6h' ? 4 : windowSpan === '12h' ? 7 : 12;

  const overall = useMemo(
    () => computeAggregateMetrics(carparks, selectedLotType),
    [carparks, selectedLotType]
  );

  // Summed passenger-car occupancy series across all carparks for the selected time window
  const islandSeries = useMemo(() => {
    const sampleHistory = carparks[0]?.hourlyHistory ?? [];
    const startIdx = Math.max(0, sampleHistory.length - sliceCount);
    const points: Array<{
      label: string;
      totalAvail: number;
      totalCap: number;
      occupancyPct: number;
    }> = [];

    for (let i = startIdx; i < sampleHistory.length; i++) {
      let sumAvail = 0;
      let sumCap = 0;
      for (const cp of carparks) {
        const carLot = cp.lots.find((l) => l.lotType === 'C');
        const histPt = cp.hourlyHistory[i];
        if (!carLot || !histPt) continue;
        sumCap += carLot.totalLots;
        sumAvail += histPt.availableCars;
      }
      const occupied = Math.max(0, sumCap - sumAvail);
      const occupancyPct =
        sumCap > 0 ? Math.round((occupied / sumCap) * 1000) / 10 : 0;
      points.push({
        label: sampleHistory[i]?.hourLabel ?? '',
        totalAvail: sumAvail,
        totalCap: sumCap,
        occupancyPct,
      });
    }
    return points;
  }, [carparks, sliceCount]);

  const startOccupancy = islandSeries[0]?.occupancyPct ?? overall.occupancyPct;
  const latestOccupancy =
    islandSeries[islandSeries.length - 1]?.occupancyPct ?? overall.occupancyPct;
  const deltaOccupancy =
    Math.round((latestOccupancy - startOccupancy) * 10) / 10;

  const regionalRows = useMemo(() => {
    return REGIONS.map((region) => {
      const subset = carparks.filter((c) => c.region === region);
      const agg = computeAggregateMetrics(subset, selectedLotType);
      // Find tightest carpark in this region
      let tightestCp: CarparkRecord | null = null;
      let lowestRatio = Infinity;
      for (const cp of subset) {
        const entry = getLotEntry(cp, selectedLotType);
        if (!entry || entry.totalLots <= 0) continue;
        const ratio = entry.lotsAvailable / entry.totalLots;
        if (ratio < lowestRatio) {
          lowestRatio = ratio;
          tightestCp = cp;
        }
      }
      return {
        region,
        gantryCount: subset.length,
        ...agg,
        tightestCp,
      };
    }).sort((a, b) => b.occupancyPct - a.occupancyPct);
  }, [carparks, selectedLotType]);

  const evCarparkCount = useMemo(
    () => carparks.filter((c) => c.evChargers > 0).length,
    [carparks]
  );
  const totalEvBays = useMemo(
    () => carparks.reduce((acc, c) => acc + c.evChargers, 0),
    [carparks]
  );

  // SVG Geometry for Islandwide Occupancy Area/Line Chart (0% to 100% Y-axis)
  const svgW = 720;
  const svgH = 210;
  const padL = 48;
  const padR = 20;
  const padT = 16;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const coords = islandSeries.map((pt, idx) => {
    const x =
      islandSeries.length <= 1
        ? padL + plotW / 2
        : Math.round(padL + (idx / (islandSeries.length - 1)) * plotW);
    const y = Math.round(padT + plotH * (1 - pt.occupancyPct / 100));
    return { ...pt, x, y };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
    .join(' ');
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x} ${padT + plotH} L ${coords[0].x} ${padT + plotH} Z`
      : '';

  return (
    <div className="space-y-6">
      {/* Top Lead Figure & Secondary Metrics Row (3_saas_dashboard.md Section 1: parted by rules, never boxed cells) */}
      <Surface className="divide-y divide-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-title font-semibold text-foreground">
              Where is parking tightest across Singapore right now?
            </h2>
            <p className="text-xs text-muted">
              Computed from summed available and total bays across {carparks.length} HDB, LTA, and URA gantries
            </p>
          </div>

          <div
            role="group"
            aria-label="Analytics time window"
            className="flex flex-wrap items-center gap-1.5"
          >
            {(
              [
                { id: '6h', label: 'Past 6 hours' },
                { id: '12h', label: 'Past 12 hours' },
                { id: '24h', label: 'Past 24 hours' },
              ] as const
            ).map((opt) => {
              const active = windowSpan === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setWindowSpan(opt.id)}
                  aria-pressed={active}
                  className={`min-h-9 whitespace-nowrap rounded-control px-3 text-xs font-medium ${
                    active
                      ? 'border border-primary bg-primary text-primary-foreground'
                      : 'border border-border/50 bg-surface text-foreground hover:bg-background'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border/40 md:grid-cols-4 md:divide-x md:divide-y-0">
          <div className="p-5">
            <p className="text-xs text-muted">Islandwide car occupancy</p>
            <p className="mt-1 text-display font-semibold text-foreground tabular-nums">
              {latestOccupancy.toFixed(1)}%
            </p>
            <p className="mt-1 text-xs text-muted tabular-nums">
              <span
                className={
                  deltaOccupancy > 0
                    ? 'font-medium text-danger'
                    : 'font-medium text-primary'
                }
              >
                {deltaOccupancy >= 0 ? `+${deltaOccupancy.toFixed(1)}` : deltaOccupancy.toFixed(1)}{' '}
                pts
              </span>{' '}
              vs start of {windowSpan} window
            </p>
          </div>

          <div className="p-5">
            <p className="text-xs text-muted">
              Open bays ({selectedLotType})
            </p>
            <p className="mt-1 text-title font-semibold text-foreground tabular-nums">
              {formatInt(overall.totalAvailable)}{' '}
              <span className="text-xs font-normal text-muted">
                / {formatInt(overall.totalCapacity)}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted tabular-nums">
              Across {overall.supportingCount} supporting carparks
            </p>
          </div>

          <div className="p-5">
            <p className="text-xs text-muted">Tight or full gantries</p>
            <p className="mt-1 text-title font-semibold text-foreground tabular-nums">
              {overall.tightOrFullCount}{' '}
              <span className="text-xs font-normal text-muted">
                of {overall.supportingCount}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted">
              &lt;8% free capacity or ≤12 lots remaining
            </p>
          </div>

          <div className="p-5">
            <p className="text-xs text-muted">EV-ready locations</p>
            <p className="mt-1 text-title font-semibold text-foreground tabular-nums">
              {formatInt(totalEvBays)} bays
            </p>
            <p className="mt-1 text-xs text-muted tabular-nums">
              Provisioned across {evCarparkCount} carparks
            </p>
          </div>
        </div>

        {/* Islandwide Occupancy Trend Chart */}
        <div className="space-y-2.5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-body font-semibold text-foreground">
              Aggregate passenger-car occupancy curve ({windowSpan})
            </h3>
            <span className="text-xs text-muted tabular-nums">
              2-hour intervals · 0% to 100% scale
            </span>
          </div>

          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="block h-auto w-full"
            role="img"
            aria-label={`Islandwide carpark occupancy percentage over ${windowSpan}`}
          >
            {[0, 25, 50, 75, 100].map((pct) => {
              const y = Math.round(padT + plotH * (1 - pct / 100));
              return (
                <g key={`y-${pct}`}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={svgW - padR}
                    y2={y}
                    stroke="var(--color-border)"
                    strokeOpacity={pct === 0 ? 0.45 : 0.18}
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
                    {pct}%
                  </text>
                </g>
              );
            })}

            {areaPath ? (
              <path
                d={areaPath}
                fill="var(--color-primary)"
                fillOpacity={0.14}
              />
            ) : null}

            {linePath ? (
              <path
                d={linePath}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {coords.map((c, idx) => {
              const showTick =
                coords.length <= 6 ||
                idx % 2 === 1 ||
                idx === 0 ||
                idx === coords.length - 1;
              return (
                <g key={`pt-${c.label}-${idx}`}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={idx === coords.length - 1 ? 4.5 : 3}
                    fill="var(--color-primary)"
                    stroke="var(--color-surface)"
                    strokeWidth={1.5}
                  />
                  {showTick ? (
                    <text
                      x={c.x}
                      y={svgH - 8}
                      textAnchor="middle"
                      fontSize={10.5}
                      fontWeight={idx === coords.length - 1 ? 600 : 400}
                      fill={
                        idx === coords.length - 1
                          ? 'var(--color-foreground)'
                          : 'var(--color-muted)'
                      }
                      className="carto-halo"
                    >
                      {c.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          <p className="text-xs text-muted">
            Occupancy rate = summed occupied passenger-car bays ÷ {formatInt(islandSeries[0]?.totalCap ?? 0)} total bays across all 19 monitored Singapore carparks.
          </p>
        </div>
      </Surface>

      {/* Planning Region Breakdown Table — each row opens its tightest carpark */}
      <Surface className="divide-y divide-border/40">
        <div className="px-5 py-4">
          <h3 className="text-title font-semibold text-foreground">
            Occupancy by URA planning region
          </h3>
          <p className="text-xs text-muted">
            Select any corridor bottleneck to open that carpark in the live gantry inspector
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="px-5 py-3">Planning region</th>
                <th className="px-4 py-3 text-right">Gantries</th>
                <th className="px-4 py-3 text-right">
                  Open / Capacity ({selectedLotType})
                </th>
                <th className="px-4 py-3 text-right">Occupancy</th>
                <th className="px-4 py-3">Tightest bottleneck</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-body">
              {regionalRows.map((row) => {
                const tightLot = row.tightestCp
                  ? getLotEntry(row.tightestCp, selectedLotType)
                  : null;
                const tightBand = tightLot
                  ? getAvailabilityBand(
                      tightLot.lotsAvailable,
                      tightLot.totalLots
                    )
                  : 'ample';

                return (
                  <tr key={row.region} className="hover:bg-background/60">
                    <td className="px-5 py-3.5 font-medium text-foreground">
                      {row.region}
                    </td>
                    <td className="px-4 py-3.5 text-right text-muted tabular-nums">
                      {row.supportingCount}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      <span className="font-semibold text-foreground">
                        {formatInt(row.totalAvailable)}
                      </span>{' '}
                      <span className="text-xs text-muted">
                        / {formatInt(row.totalCapacity)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-foreground tabular-nums">
                      {row.occupancyPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {row.tightestCp && tightLot ? (
                        <div>
                          <span className="font-medium text-foreground">
                            {row.tightestCp.name}
                          </span>
                          <p className="text-muted tabular-nums">
                            <span
                              className={
                                tightBand === 'tight' || tightBand === 'full'
                                  ? 'font-medium text-danger'
                                  : 'font-medium text-accent'
                              }
                            >
                              {getBandLabel(tightBand)}
                            </span>
                            {' · '}
                            {tightLot.lotsAvailable} / {tightLot.totalLots} left
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted">No bays for class</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {row.tightestCp ? (
                        <Button
                          tone="quiet"
                          className="min-h-9 px-3 text-xs"
                          onClick={() => onInspectCarpark(row.tightestCp!.id)}
                        >
                          Open carpark
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
};
