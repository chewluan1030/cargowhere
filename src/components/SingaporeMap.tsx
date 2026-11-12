import React, { useMemo } from 'react';
import type {
  CarparkRecord,
  LotType,
  PlanningRegion,
} from '../types/carpark';
import {
  type Box2D,
  computeCollisionFreeLabels,
  getAvailabilityBand,
  getBandLabel,
  getLotEntry,
  projectLatLngToSvg,
  SINGAPORE_VIEWPORTS,
  SVG_MAP_HEIGHT,
  SVG_MAP_WIDTH,
} from '../utils/carparkMath';

// Accurate WGS84 coastline vertices for Singapore main island
const SG_MAIN_ISLAND_LATLNG: Array<[number, number]> = [
  [1.264, 103.622], // Tuas South-West
  [1.318, 103.631], // Tuas West
  [1.362, 103.639], // Raffles Marina / Tuas North
  [1.418, 103.669], // Sarimbun / Lim Chu Kang
  [1.444, 103.719], // Kranji Reservoir
  [1.451, 103.768], // Woodlands Causeway
  [1.466, 103.818], // Sembawang Shipyard
  [1.448, 103.856], // Yishun Dam / Seletar
  [1.421, 103.909], // Punggol Point
  [1.394, 103.936], // Pasir Ris Coast
  [1.392, 103.988], // Changi Point
  [1.376, 104.018], // Changi East North
  [1.318, 104.012], // Changi South / Tanah Merah
  [1.309, 103.962], // East Coast Bedok
  [1.298, 103.908], // Marine Parade
  [1.281, 103.869], // Marina Barrage / Gardens East
  [1.271, 103.853], // Marina South Pier
  [1.263, 103.822], // HarbourFront
  [1.277, 103.786], // Pasir Panjang Terminal
  [1.298, 103.758], // West Coast / Pandan
  [1.302, 103.702], // Jurong Port
  [1.288, 103.652], // Gul / Pioneer
  [1.242, 103.619], // Tuas South Tip
];

const SENTOSA_LATLNG: Array<[number, number]> = [
  [1.258, 103.809],
  [1.256, 103.827],
  [1.243, 103.842],
  [1.239, 103.828],
  [1.249, 103.808],
];

const JURONG_ISLAND_LATLNG: Array<[number, number]> = [
  [1.285, 103.678],
  [1.289, 103.722],
  [1.266, 103.729],
  [1.247, 103.688],
  [1.258, 103.666],
];

const PULAU_UBIN_LATLNG: Array<[number, number]> = [
  [1.418, 103.932],
  [1.424, 103.972],
  [1.406, 103.996],
  [1.399, 103.964],
  [1.407, 103.934],
];

interface ExpresswayCorridor {
  code: string;
  points: Array<[number, number]>;
  labelAnchorIdx: number;
  labelOffset: { dx: number; dy: number };
}

const EXPRESSWAYS: ExpresswayCorridor[] = [
  {
    code: 'PIE',
    points: [
      [1.324, 103.652],
      [1.345, 103.705],
      [1.342, 103.755],
      [1.334, 103.812],
      [1.329, 103.856],
      [1.331, 103.905],
      [1.344, 103.952],
      [1.354, 103.985],
    ],
    labelAnchorIdx: 3,
    labelOffset: { dx: 0, dy: -14 },
  },
  {
    code: 'AYE / ECP',
    points: [
      [1.321, 103.662],
      [1.318, 103.742],
      [1.289, 103.795],
      [1.274, 103.838],
      [1.282, 103.866],
      [1.299, 103.908],
      [1.316, 103.958],
      [1.351, 103.989],
    ],
    labelAnchorIdx: 6,
    labelOffset: { dx: 12, dy: 16 },
  },
  {
    code: 'CTE',
    points: [
      [1.279, 103.841],
      [1.304, 103.844],
      [1.335, 103.859],
      [1.369, 103.857],
      [1.398, 103.859],
    ],
    labelAnchorIdx: 4,
    labelOffset: { dx: 16, dy: 2 },
  },
  {
    code: 'BKE / SLE',
    points: [
      [1.336, 103.782],
      [1.384, 103.774],
      [1.434, 103.769],
      [1.425, 103.802],
      [1.398, 103.859],
    ],
    labelAnchorIdx: 1,
    labelOffset: { dx: -22, dy: 0 },
  },
  {
    code: 'TPE',
    points: [
      [1.398, 103.859],
      [1.396, 103.904],
      [1.374, 103.941],
      [1.356, 103.964],
    ],
    labelAnchorIdx: 1,
    labelOffset: { dx: 0, dy: -14 },
  },
];

function toPolygonPoints(
  coords: Array<[number, number]>,
  viewportKey: 'all' | PlanningRegion
): string {
  const vp = SINGAPORE_VIEWPORTS[viewportKey];
  return coords
    .map(([lat, lng]) => {
      const p = projectLatLngToSvg(lat, lng, vp);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

function toPathD(
  coords: Array<[number, number]>,
  viewportKey: 'all' | PlanningRegion
): string {
  const vp = SINGAPORE_VIEWPORTS[viewportKey];
  return coords
    .map(([lat, lng], i) => {
      const p = projectLatLngToSvg(lat, lng, vp);
      return `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
    })
    .join(' ');
}

interface SingaporeMapProps {
  carparks: CarparkRecord[];
  selectedId: string | null;
  savedIds: string[];
  lotType: LotType;
  regionViewport: 'all' | PlanningRegion;
  onRegionViewportChange: (region: 'all' | PlanningRegion) => void;
  onSelectCarpark: (id: string) => void;
}

export const SingaporeMap: React.FC<SingaporeMapProps> = ({
  carparks,
  selectedId,
  savedIds,
  lotType,
  regionViewport,
  onRegionViewportChange,
  onSelectCarpark,
}) => {
  const vp = SINGAPORE_VIEWPORTS[regionViewport];

  const projectedData = useMemo(() => {
    const mainIsland = toPolygonPoints(SG_MAIN_ISLAND_LATLNG, regionViewport);
    const sentosa = toPolygonPoints(SENTOSA_LATLNG, regionViewport);
    const jurongIsland = toPolygonPoints(JURONG_ISLAND_LATLNG, regionViewport);
    const pulauUbin = toPolygonPoints(PULAU_UBIN_LATLNG, regionViewport);

    const reservedBoxes: Box2D[] = [];

    const expresswayPaths = EXPRESSWAYS.map((exp) => {
      const d = toPathD(exp.points, regionViewport);
      const anchorCoord = exp.points[exp.labelAnchorIdx] ?? exp.points[0];
      const basePt = projectLatLngToSvg(anchorCoord[0], anchorCoord[1], vp);
      const lx = Math.round(basePt.x + exp.labelOffset.dx);
      const ly = Math.round(basePt.y + exp.labelOffset.dy);
      const inFrame =
        lx > 36 &&
        lx < SVG_MAP_WIDTH - 36 &&
        ly > 24 &&
        ly < SVG_MAP_HEIGHT - 24;

      if (inFrame) {
        const halfW = Math.ceil(exp.code.length * 3.6) + 6;
        reservedBoxes.push({
          x1: lx - halfW,
          y1: ly - 10,
          x2: lx + halfW,
          y2: ly + 4,
        });
      }

      return {
        code: exp.code,
        d,
        lx,
        ly,
        showLabel: inFrame,
      };
    });

    const pins = carparks.map((cp) => {
      const pos = projectLatLngToSvg(cp.lat, cp.lng, vp);
      const entry = getLotEntry(cp, lotType);
      const avail = entry ? entry.lotsAvailable : 0;
      const total = entry ? entry.totalLots : 0;
      const band = getAvailabilityBand(avail, total);
      const isSelected = cp.id === selectedId;
      const isSaved = savedIds.includes(cp.id);

      const priority = isSelected
        ? 0
        : isSaved
          ? 1
          : band === 'tight' || band === 'full'
            ? 2
            : 3;

      const shortName =
        cp.planningArea === 'Downtown Core'
          ? cp.id === 'LTA-SUN'
            ? 'Suntec'
            : 'MBFC'
          : cp.planningArea;

      return {
        cp,
        px: pos.x,
        py: pos.y,
        avail,
        total,
        band,
        hasLotType: Boolean(entry),
        isSelected,
        isSaved,
        priority,
        labelText: `${shortName} · ${entry ? avail : '—'}`,
      };
    });

    const placedLabels = computeCollisionFreeLabels(
      pins
        .filter((p) => p.hasLotType)
        .map((p) => ({
          id: p.cp.id,
          label: p.labelText,
          px: p.px,
          py: p.py,
          priority: p.priority,
        })),
      reservedBoxes
    );

    return {
      mainIsland,
      sentosa,
      jurongIsland,
      pulauUbin,
      expresswayPaths,
      pins,
      placedLabels,
    };
  }, [carparks, lotType, regionViewport, savedIds, selectedId, vp]);

  const regionTabs: Array<{ id: 'all' | PlanningRegion; label: string }> = [
    { id: 'all', label: 'All Singapore' },
    { id: 'Central', label: 'Central & CBD' },
    { id: 'East', label: 'East & Changi' },
    { id: 'West', label: 'West & Jurong' },
    { id: 'North', label: 'North' },
    { id: 'North-East', label: 'North-East' },
  ];

  const getPinColors = (band: ReturnType<typeof getAvailabilityBand>, hasLotType: boolean) => {
    if (!hasLotType) {
      return {
        fill: 'var(--color-surface)',
        stroke: 'var(--color-muted)',
      };
    }
    switch (band) {
      case 'ample':
        return {
          fill: 'var(--color-primary)',
          stroke: 'var(--color-surface)',
        };
      case 'moderate':
        return {
          fill: 'var(--color-accent)',
          stroke: 'var(--color-surface)',
        };
      case 'tight':
      case 'full':
        return {
          fill: 'var(--color-danger)',
          stroke: 'var(--color-surface)',
        };
    }
  };

  return (
    <div className="divide-y divide-border/40">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-body font-semibold text-foreground">
            Singapore expressway & carpark locator
          </h2>
          <p className="text-xs text-muted">
            Click a gantry pin to inspect live {lotType === 'C' ? 'car' : lotType === 'Y' ? 'motorcycle' : 'heavy vehicle'} bays and EPS tariff
          </p>
        </div>

        <div
          role="group"
          aria-label="Map region zoom"
          className="flex flex-wrap items-center gap-1.5"
        >
          {regionTabs.map((tab) => {
            const active = regionViewport === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onRegionViewportChange(tab.id)}
                aria-pressed={active}
                className={`min-h-8 whitespace-nowrap rounded-control px-2.5 text-xs font-medium transition-[background-color,color,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  active
                    ? 'border border-primary bg-primary text-primary-foreground'
                    : 'border border-border/50 bg-surface text-foreground hover:bg-background'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-water/60">
        <svg
          viewBox={`0 0 ${SVG_MAP_WIDTH} ${SVG_MAP_HEIGHT}`}
          className="block h-auto w-full select-none"
          role="img"
          aria-label={`Singapore carpark availability locator map (${vp.label})`}
        >
          <defs>
            <clipPath id="sg-map-clip">
              <rect
                x="0"
                y="0"
                width={SVG_MAP_WIDTH}
                height={SVG_MAP_HEIGHT}
              />
            </clipPath>
          </defs>

          <g clipPath="url(#sg-map-clip)">
            {/* Straits of Johor & Singapore Strait water background */}
            <rect
              x="0"
              y="0"
              width={SVG_MAP_WIDTH}
              height={SVG_MAP_HEIGHT}
              fill="var(--color-water)"
            />

            {/* Subtle lat/lng graticule */}
            {[125, 250, 375].map((gy) => (
              <line
                key={`gy-${gy}`}
                x1={0}
                y1={gy}
                x2={SVG_MAP_WIDTH}
                y2={gy}
                stroke="var(--color-border)"
                strokeOpacity={0.14}
                strokeDasharray="3 5"
              />
            ))}
            {[220, 440, 660].map((gx) => (
              <line
                key={`gx-${gx}`}
                x1={gx}
                y1={0}
                x2={gx}
                y2={SVG_MAP_HEIGHT}
                stroke="var(--color-border)"
                strokeOpacity={0.14}
                strokeDasharray="3 5"
              />
            ))}

            {/* Singapore Islands Landmass */}
            <polygon
              points={projectedData.mainIsland}
              fill="var(--color-land)"
              stroke="var(--color-border)"
              strokeOpacity={0.55}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            <polygon
              points={projectedData.sentosa}
              fill="var(--color-land)"
              stroke="var(--color-border)"
              strokeOpacity={0.5}
              strokeWidth={1.1}
              strokeLinejoin="round"
            />
            <polygon
              points={projectedData.jurongIsland}
              fill="var(--color-land)"
              stroke="var(--color-border)"
              strokeOpacity={0.45}
              strokeWidth={1.1}
              strokeLinejoin="round"
            />
            <polygon
              points={projectedData.pulauUbin}
              fill="var(--color-land)"
              stroke="var(--color-border)"
              strokeOpacity={0.45}
              strokeWidth={1.1}
              strokeLinejoin="round"
            />

            {/* Major Singapore Expressways (PIE, ECP/AYE, CTE, BKE/SLE, TPE) */}
            {projectedData.expresswayPaths.map((exp) => (
              <path
                key={exp.code}
                d={exp.d}
                fill="none"
                stroke="var(--color-primary)"
                strokeOpacity={0.28}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* Carpark Gantry Nodes */}
            {projectedData.pins.map((pin) => {
              if (
                pin.px < -16 ||
                pin.px > SVG_MAP_WIDTH + 16 ||
                pin.py < -16 ||
                pin.py > SVG_MAP_HEIGHT + 16
              ) {
                return null;
              }
              const colors = getPinColors(pin.band, pin.hasLotType);
              const radius = pin.isSelected ? 8.5 : 6.2;

              return (
                <g
                  key={pin.cp.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${pin.cp.name}: ${
                    pin.hasLotType
                      ? `${pin.avail} of ${pin.total} lots available (${getBandLabel(pin.band)})`
                      : 'No bays for selected vehicle class'
                  }`}
                  onClick={() => onSelectCarpark(pin.cp.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectCarpark(pin.cp.id);
                    }
                  }}
                  className="cursor-pointer focus:outline-none"
                >
                  {/* Invisible 28x28 hit area for comfortable pointer & touch selection */}
                  <circle
                    cx={pin.px}
                    cy={pin.py}
                    r={14}
                    fill="transparent"
                  />
                  {pin.isSelected ? (
                    <circle
                      cx={pin.px}
                      cy={pin.py}
                      r={13.5}
                      fill="none"
                      stroke="var(--color-foreground)"
                      strokeWidth={2}
                    />
                  ) : null}
                  <circle
                    cx={pin.px}
                    cy={pin.py}
                    r={radius}
                    fill={colors.fill}
                    stroke={colors.stroke}
                    strokeWidth={2}
                  />
                </g>
              );
            })}

            {/* Labels Layer Rendered Strictly Last with Explicit Numeric x/y & Cartographic Halo */}
            <g aria-hidden="true" pointerEvents="none">
              {projectedData.expresswayPaths.map((exp) =>
                exp.showLabel ? (
                  <text
                    key={`lbl-${exp.code}`}
                    x={exp.lx}
                    y={exp.ly}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontWeight={600}
                    letterSpacing="0.05em"
                    fill="var(--color-muted)"
                    className="carto-halo-land"
                  >
                    {exp.code}
                  </text>
                ) : null
              )}

              {Array.from(projectedData.placedLabels.values()).map((lbl) => {
                const isSelected = lbl.id === selectedId;
                return (
                  <text
                    key={`cp-lbl-${lbl.id}`}
                    x={lbl.x}
                    y={lbl.y}
                    textAnchor={lbl.textAnchor}
                    fontSize={isSelected ? 12 : 11}
                    fontWeight={isSelected ? 600 : 500}
                    fill="var(--color-foreground)"
                    className="carto-halo"
                  >
                    {lbl.text}
                  </text>
                );
              })}
            </g>
          </g>
        </svg>
      </div>

      {/* Quiet HTML legend & coordinate footer */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-primary" />
            Available (≥28% free)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-accent" />
            Filling (8–27% free)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-danger" />
            Tight / Full (&lt;8% or ≤12 lots)
          </span>
        </div>
        <span>SVY21 / WGS84 · Expressways PIE · ECP · AYE · CTE · TPE · BKE</span>
      </div>
    </div>
  );
};
