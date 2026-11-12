import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  Car,
  Code2,
  MapPin,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { INITIAL_SINGAPORE_CARPARKS } from './data/singaporeCarparks';
import type {
  ActiveParkingSession,
  Agency,
  CarparkRecord,
  FeedDiagnosticMode,
  LotType,
  PlanningRegion,
} from './types/carpark';
import {
  calculateParkingFeeCents,
  computeAggregateMetrics,
  formatInt,
  formatSGD,
  getAvailabilityBand,
  getBandLabel,
  getLotEntry,
} from './utils/carparkMath';
import {
  fetchCarparkFeed,
  loadActiveParkingSession,
  loadSavedCarparkIds,
  persistActiveParkingSession,
  persistSavedCarparkIds,
  resetAllLocalState,
} from './services/carparkClient';
import { SingaporeMap } from './components/SingaporeMap';
import { CarparkInspector } from './components/CarparkInspector';
import { SavedAndParkedView } from './components/SavedAndParkedView';
import { CorridorAnalyticsView } from './components/CorridorAnalyticsView';
import { BackendContractView } from './components/BackendContractView';
import { Button, Surface } from './components/ui';

type WorkspaceView = 'live' | 'saved' | 'analytics' | 'contract';
type SortOrder = 'recommended' | 'most-available' | 'tightest' | 'lowest-fee';
type BandFilter = 'all' | 'open-only' | 'tight-only';

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('live');
  const [carparks, setCarparks] = useState<CarparkRecord[]>(
    () => INITIAL_SINGAPORE_CARPARKS
  );
  const [savedIds, setSavedIds] = useState<string[]>(() =>
    loadSavedCarparkIds()
  );
  const [activeSession, setActiveSession] =
    useState<ActiveParkingSession | null>(() => loadActiveParkingSession());

  // Feed polling & diagnostic state
  const [feedTick, setFeedTick] = useState<number>(1);
  const [lastUpdatedIso, setLastUpdatedIso] = useState<string>(() =>
    new Date().toISOString()
  );
  const [pollingSeconds, setPollingSeconds] = useState<number>(30);
  const [diagnosticMode, setDiagnosticMode] =
    useState<FeedDiagnosticMode>('normal');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  // Live Locator Filters & Selection
  const [selectedId, setSelectedId] = useState<string>('ACB');
  const [mobileInspectorOpen, setMobileInspectorOpen] =
    useState<boolean>(false);
  const [selectedLotType, setSelectedLotType] = useState<LotType>('C');
  const [agencyFilter, setAgencyFilter] = useState<'ALL' | Agency>('ALL');
  const [regionViewport, setRegionViewport] = useState<'all' | PlanningRegion>(
    'all'
  );
  const [bandFilter, setBandFilter] = useState<BandFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('recommended');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAllRows, setShowAllRows] = useState<boolean>(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState<string>('');

  const triggerFeedPoll = useCallback(
    async (nextTick: number) => {
      setIsRefreshing(true);
      try {
        const res = await fetchCarparkFeed({
          currentRecords: carparks,
          tick: nextTick,
          diagnosticMode,
        });
        setCarparks(res.items);
        setLastUpdatedIso(res.timestamp);
        setFeedError(null);
      } catch (err) {
        setFeedError(
          err instanceof Error
            ? err.message
            : 'Unable to reach Singapore gantry feed.'
        );
      } finally {
        setIsRefreshing(false);
      }
    },
    [carparks, diagnosticMode]
  );

  const handleManualRefresh = () => {
    const next = feedTick + 1;
    setFeedTick(next);
    void triggerFeedPoll(next);
  };

  // Automatic background polling interval
  useEffect(() => {
    if (pollingSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setFeedTick((prev) => {
        const next = prev + 1;
        void fetchCarparkFeed({
          currentRecords: carparks,
          tick: next,
          diagnosticMode,
        })
          .then((res) => {
            setCarparks(res.items);
            setLastUpdatedIso(res.timestamp);
            setFeedError(null);
          })
          .catch((err) => {
            setFeedError(
              err instanceof Error
                ? err.message
                : 'Unable to reach Singapore gantry feed.'
            );
          });
        return next;
      });
    }, pollingSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [carparks, diagnosticMode, pollingSeconds]);

  const handleToggleSave = useCallback((id: string) => {
    setSavedIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((item) => item !== id) : [...prev, id];
      persistSavedCarparkIds(next);
      return next;
    });
  }, []);

  const handleStartParkingSession = useCallback(
    (
      carparkId: string,
      lotType: LotType,
      deckAndLot: string,
      plannedDurationMins: number
    ) => {
      const nextSession: ActiveParkingSession = {
        carparkId,
        lotType,
        deckAndLot,
        startedAtMs: Date.now(),
        plannedDurationMins,
      };
      setActiveSession(nextSession);
      persistActiveParkingSession(nextSession);
      const cpName =
        carparks.find((c) => c.id === carparkId)?.name ?? carparkId;
      setStatusAnnouncement(`Started parking timer at ${cpName} (${deckAndLot})`);
    },
    [carparks]
  );

  const handleEndParkingSession = useCallback(() => {
    setActiveSession(null);
    persistActiveParkingSession(null);
  }, []);

  const handleRestoreParkingSession = useCallback(
    (session: ActiveParkingSession) => {
      setActiveSession(session);
      persistActiveParkingSession(session);
    },
    []
  );

  const handleResetAll = useCallback(() => {
    const fresh = resetAllLocalState();
    setCarparks(fresh.carparks);
    setSavedIds(fresh.savedIds);
    setActiveSession(fresh.session);
    setStatusAnnouncement('Reset saved carparks and parking session defaults.');
  }, []);

  const filteredCarparks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matches = carparks.filter((cp) => {
      if (agencyFilter !== 'ALL' && cp.agency !== agencyFilter) return false;
      if (regionViewport !== 'all' && cp.region !== regionViewport)
        return false;

      const lotEntry = getLotEntry(cp, selectedLotType);
      if (selectedLotType !== 'C' && !lotEntry) return false;

      if (bandFilter !== 'all') {
        const avail = lotEntry?.lotsAvailable ?? 0;
        const total = lotEntry?.totalLots ?? 0;
        const band = getAvailabilityBand(avail, total);
        if (bandFilter === 'open-only' && (band === 'tight' || band === 'full'))
          return false;
        if (
          bandFilter === 'tight-only' &&
          band !== 'tight' &&
          band !== 'full'
        ) {
          return false;
        }
      }

      if (q) {
        const haystack =
          `${cp.id} ${cp.name} ${cp.address} ${cp.planningArea} ${cp.expresswayExit} ${cp.agency}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    return [...matches].sort((a, b) => {
      const lotA = getLotEntry(a, selectedLotType);
      const lotB = getLotEntry(b, selectedLotType);
      const availA = lotA?.lotsAvailable ?? -1;
      const availB = lotB?.lotsAvailable ?? -1;

      if (sortOrder === 'most-available') {
        return availB - availA;
      }
      if (sortOrder === 'tightest') {
        const ratioA =
          lotA && lotA.totalLots > 0 ? lotA.lotsAvailable / lotA.totalLots : 2;
        const ratioB =
          lotB && lotB.totalLots > 0 ? lotB.lotsAvailable / lotB.totalLots : 2;
        return ratioA - ratioB;
      }
      if (sortOrder === 'lowest-fee') {
        const feeA = calculateParkingFeeCents(a, selectedLotType, 60, false)
          .feeCents;
        const feeB = calculateParkingFeeCents(b, selectedLotType, 60, false)
          .feeCents;
        return feeA - feeB;
      }
      // Recommended: saved carparks first, then Central/major hubs
      const savedDiff =
        Number(savedIds.includes(b.id)) - Number(savedIds.includes(a.id));
      if (savedDiff !== 0) return savedDiff;
      return a.name.localeCompare(b.name);
    });
  }, [
    agencyFilter,
    bandFilter,
    carparks,
    regionViewport,
    savedIds,
    searchQuery,
    selectedLotType,
    sortOrder,
  ]);

  const selectedCarpark = useMemo(() => {
    return (
      carparks.find((c) => c.id === selectedId) ??
      filteredCarparks[0] ??
      carparks[0]
    );
  }, [carparks, filteredCarparks, selectedId]);

  const filteredSummary = useMemo(
    () => computeAggregateMetrics(filteredCarparks, selectedLotType),
    [filteredCarparks, selectedLotType]
  );

  const visibleDirectoryRows = showAllRows
    ? filteredCarparks
    : filteredCarparks.slice(0, 9);

  const handleSelectAndInspect = (id: string) => {
    setSelectedId(id);
    setActiveView('live');
    setMobileInspectorOpen(true);
  };

  const resetLiveFilters = () => {
    setSearchQuery('');
    setAgencyFilter('ALL');
    setRegionViewport('all');
    setBandFilter('all');
    setSelectedLotType('C');
    setSortOrder('recommended');
  };

  const navItems: Array<{
    id: WorkspaceView;
    label: string;
    shortLabel: string;
    icon: React.FC<{ className?: string }>;
    meta?: string;
  }> = [
    {
      id: 'live',
      label: 'Live carparks',
      shortLabel: 'Live',
      icon: MapPin,
      meta: `${carparks.length}`,
    },
    {
      id: 'saved',
      label: 'Saved & parked',
      shortLabel: 'Saved',
      icon: Bookmark,
      meta: activeSession ? '1 active' : `${savedIds.length}`,
    },
    {
      id: 'analytics',
      label: 'Corridor trends',
      shortLabel: 'Trends',
      icon: BarChart3,
    },
    {
      id: 'contract',
      label: 'API contract',
      shortLabel: 'API',
      icon: Code2,
    },
  ];

  const viewHeadings: Record<
    WorkspaceView,
    { title: string; subtitle: string }
  > = {
    live: {
      title: 'Singapore carpark availability',
      subtitle: `HDB, LTA & URA gantries · Updated ${new Date(
        lastUpdatedIso
      ).toLocaleTimeString('en-SG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`,
    },
    saved: {
      title: 'Saved carparks & parking timer',
      subtitle: 'Commuter bookmarks and live EPS stay tracker',
    },
    analytics: {
      title: 'Islandwide occupancy & corridors',
      subtitle: 'Regional capacity across URA planning areas',
    },
    contract: {
      title: 'Frontend-to-backend feed contract',
      subtitle: 'Adapter schema for LTA DataMall & data.gov.sg',
    },
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
        {/* Desktop Sidebar Navigation (no top nav when sidebar leads) */}
        <aside
          aria-label="Workspace navigation"
          className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:justify-between md:border-r md:border-border/40 md:bg-surface"
        >
          <div className="divide-y divide-border/40">
            <div className="px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-control bg-primary text-sm font-bold text-primary-foreground">
                  P
                </span>
                <div>
                  <span className="block text-body font-semibold tracking-tight text-foreground">
                    LotWatch SG
                  </span>
                  <span className="block text-xs text-muted">
                    Islandwide gantry monitor
                  </span>
                </div>
              </div>
            </div>

            <nav className="space-y-1 p-3" aria-label="Main views">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 whitespace-nowrap rounded-control px-3 text-body font-medium transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-background'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </span>
                    {item.meta ? (
                      <span
                        className={`text-xs tabular-nums ${
                          active ? 'text-primary-foreground/85' : 'text-muted'
                        }`}
                      >
                        {item.meta}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quiet Sidebar Footer parted strictly by 1px hairline */}
          <div className="divide-y divide-border/40 border-t border-border/40 text-xs">
            {activeSession ? (
              <div className="space-y-1.5 p-4">
                <p className="font-medium text-foreground">
                  Parked at{' '}
                  <span className="font-mono">{activeSession.carparkId}</span>
                </p>
                <p className="text-muted">{activeSession.deckAndLot}</p>
                <button
                  type="button"
                  onClick={() => setActiveView('saved')}
                  className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  View live EPS charge →
                </button>
              </div>
            ) : null}

            <div className="p-4 text-muted">
              <p className="text-foreground">
                {pollingSeconds > 0
                  ? `Auto-poll every ${pollingSeconds}s`
                  : 'Auto-poll paused'}
              </p>
              <p className="mt-0.5">
                HDB · LTA DataMall · URA schema ready
              </p>
            </div>
          </div>
        </aside>

        {/* Main Workspace Pane */}
        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-8">
          {/* Workspace Header: Title + <=8-word scope phrase left; 1 primary + 1 secondary action right */}
          <header className="border-b border-border/40 bg-surface px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 md:hidden">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-control bg-primary text-xs font-bold text-primary-foreground">
                    P
                  </span>
                  <span className="text-xs font-semibold text-primary">
                    LotWatch SG
                  </span>
                </div>
                <h1 className="text-title font-semibold text-foreground sm:text-display">
                  {viewHeadings[activeView].title}
                </h1>
                <p className="mt-0.5 text-xs text-muted tabular-nums">
                  {viewHeadings[activeView].subtitle}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  tone="quiet"
                  onClick={() => setActiveView('saved')}
                >
                  <Car className="h-4 w-4 text-primary" aria-hidden="true" />
                  {activeSession
                    ? `Parked: ${activeSession.carparkId}`
                    : 'Log parked car'}
                </Button>

                <Button
                  tone="primary"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {isRefreshing ? 'Refreshing…' : 'Refresh feed'}
                </Button>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 space-y-5 px-4 pt-5 sm:px-6">
            {/* Screen-reader & polite status feedback */}
            {statusAnnouncement ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center justify-between gap-3 rounded-control border border-border/40 bg-surface px-4 py-2.5 text-xs text-foreground"
              >
                <span>{statusAnnouncement}</span>
                <button
                  type="button"
                  aria-label="Dismiss status message"
                  onClick={() => setStatusAnnouncement('')}
                  className="p-1 text-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            {/* Non-destructive Upstream Feed Error Banner (retains last verified carpark counts) */}
            {feedError ? (
              <Surface className="px-4 py-3.5">
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5 text-body">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-danger"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-medium text-foreground">{feedError}</p>
                      <p className="text-xs text-muted">
                        Last verified gantry counts from{' '}
                        {new Date(lastUpdatedIso).toLocaleTimeString('en-SG')}{' '}
                        remain displayed below.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      tone="quiet"
                      className="min-h-9 px-3 text-xs"
                      onClick={() => {
                        setDiagnosticMode('normal');
                        setFeedError(null);
                      }}
                    >
                      Restore normal feed
                    </Button>
                    <Button
                      tone="primary"
                      className="min-h-9 px-3 text-xs"
                      onClick={handleManualRefresh}
                    >
                      Retry now
                    </Button>
                  </div>
                </div>
              </Surface>
            ) : null}

            {/* VIEW 1: LIVE CARPARKS */}
            {activeView === 'live' ? (
              <>
                {/* Mobile Single-Carpark Inspector Screen with Back Button */}
                {mobileInspectorOpen && selectedCarpark ? (
                  <div className="lg:hidden">
                    <CarparkInspector
                      carpark={selectedCarpark}
                      selectedLotType={selectedLotType}
                      isSaved={savedIds.includes(selectedCarpark.id)}
                      isActiveSessionHere={
                        activeSession?.carparkId === selectedCarpark.id
                      }
                      onToggleSave={handleToggleSave}
                      onStartParkingSession={handleStartParkingSession}
                      onBackMobile={() => setMobileInspectorOpen(false)}
                    />
                  </div>
                ) : null}

                <div
                  className={`${
                    mobileInspectorOpen ? 'hidden lg:grid' : 'grid'
                  } grid-cols-1 gap-6 lg:grid-cols-12`}
                >
                  {/* Left Column: Filters + Interactive Singapore SVG Map + Live Directory */}
                  <div className="min-w-0 space-y-5 lg:col-span-7">
                    {/* Search & Multi-Facet Controls */}
                    <Surface className="divide-y divide-border/40">
                      <div className="p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                          <div className="relative sm:col-span-7">
                            <label
                              htmlFor="carpark-search"
                              className="sr-only"
                            >
                              Search carpark name, code, road, or planning area
                            </label>
                            <Search
                              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
                              aria-hidden="true"
                            />
                            <input
                              id="carpark-search"
                              type="search"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search road, mall, town or code (ACB, TP12, Orchard)…"
                              className="min-h-11 w-full rounded-control border border-border/60 bg-surface pr-3 pl-9 text-body text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            />
                          </div>

                          <div className="sm:col-span-5">
                            <label htmlFor="sort-carparks" className="sr-only">
                              Sort carparks
                            </label>
                            <select
                              id="sort-carparks"
                              value={sortOrder}
                              onChange={(e) =>
                                setSortOrder(e.target.value as SortOrder)
                              }
                              className="min-h-11 w-full rounded-control border border-border/60 bg-surface px-3 text-body text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <option value="recommended">
                                Sort: Saved & alphabetical
                              </option>
                              <option value="most-available">
                                Sort: Most open bays
                              </option>
                              <option value="tightest">
                                Sort: Tightest capacity first
                              </option>
                              <option value="lowest-fee">
                                Sort: Lowest 1-hr weekday fee
                              </option>
                            </select>
                          </div>
                        </div>

                        {/* Filter Control Chips (strictly interactive controls, flex-wrap) */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
                          {/* Lot Type Segment */}
                          <div
                            role="group"
                            aria-label="Vehicle lot class"
                            className="flex flex-wrap items-center gap-1.5"
                          >
                            {(
                              [
                                { id: 'C', label: 'Cars (C)' },
                                { id: 'Y', label: 'Motorcycles (Y)' },
                                { id: 'H', label: 'Heavy (H)' },
                              ] as const
                            ).map((lt) => {
                              const active = selectedLotType === lt.id;
                              return (
                                <button
                                  key={lt.id}
                                  type="button"
                                  onClick={() => setSelectedLotType(lt.id)}
                                  aria-pressed={active}
                                  className={`min-h-9 whitespace-nowrap rounded-control px-3 text-xs font-medium ${
                                    active
                                      ? 'border border-primary bg-primary text-primary-foreground'
                                      : 'border border-border/50 bg-surface text-foreground hover:bg-background'
                                  }`}
                                >
                                  {lt.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Agency & Status Controls */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(['ALL', 'HDB', 'LTA', 'URA'] as const).map(
                              (ag) => {
                                const active = agencyFilter === ag;
                                return (
                                  <button
                                    key={ag}
                                    type="button"
                                    onClick={() => setAgencyFilter(ag)}
                                    aria-pressed={active}
                                    className={`min-h-9 whitespace-nowrap rounded-control px-2.5 text-xs font-medium ${
                                      active
                                        ? 'border border-foreground bg-foreground text-surface'
                                        : 'border border-border/50 bg-surface text-foreground hover:bg-background'
                                    }`}
                                  >
                                    {ag === 'ALL' ? 'All agencies' : ag}
                                  </button>
                                );
                              }
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setBandFilter((prev) =>
                                  prev === 'open-only' ? 'all' : 'open-only'
                                )
                              }
                              aria-pressed={bandFilter === 'open-only'}
                              className={`min-h-9 whitespace-nowrap rounded-control px-2.5 text-xs font-medium ${
                                bandFilter === 'open-only'
                                  ? 'border border-primary bg-primary text-primary-foreground'
                                  : 'border border-border/50 bg-surface text-foreground hover:bg-background'
                              }`}
                            >
                              Available only
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Aggregate Strip for Current Filter View */}
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-muted tabular-nums">
                        <span>
                          Showing{' '}
                          <strong className="font-semibold text-foreground">
                            {filteredCarparks.length}
                          </strong>{' '}
                          of {carparks.length} carparks ·{' '}
                          <strong className="font-semibold text-foreground">
                            {formatInt(filteredSummary.totalAvailable)}
                          </strong>{' '}
                          open bays ({100 - Math.round(filteredSummary.occupancyPct)}% free)
                        </span>
                        {searchQuery ||
                        agencyFilter !== 'ALL' ||
                        regionViewport !== 'all' ||
                        bandFilter !== 'all' ||
                        selectedLotType !== 'C' ? (
                          <button
                            type="button"
                            onClick={resetLiveFilters}
                            className="font-medium text-primary hover:underline"
                          >
                            Reset filters
                          </button>
                        ) : null}
                      </div>
                    </Surface>

                    {/* Self-Contained Singapore Locator Map */}
                    <Surface className="overflow-hidden">
                      <SingaporeMap
                        carparks={filteredCarparks}
                        selectedId={selectedCarpark?.id ?? null}
                        savedIds={savedIds}
                        lotType={selectedLotType}
                        regionViewport={regionViewport}
                        onRegionViewportChange={setRegionViewport}
                        onSelectCarpark={(id) => {
                          setSelectedId(id);
                          setMobileInspectorOpen(true);
                        }}
                      />
                    </Surface>

                    {/* Live Carpark Directory List (no inner scroll box; clean Show all toggle) */}
                    <Surface className="divide-y divide-border/40">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
                        <h2 className="text-body font-semibold text-foreground">
                          Live gantry directory
                        </h2>
                        <span className="text-xs text-muted">
                          Lot counts & weekday 1-hour tariff ({selectedLotType})
                        </span>
                      </div>

                      {isRefreshing && diagnosticMode === 'slow-network' ? (
                        <div
                          aria-busy="true"
                          aria-label="Loading Singapore carpark availability"
                          className="divide-y divide-border/40"
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div
                              key={n}
                              className="flex items-center justify-between gap-4 px-4 py-4"
                            >
                              <div className="space-y-2">
                                <div className="h-4 w-48 animate-pulse rounded-xs bg-border/25" />
                                <div className="h-3 w-64 animate-pulse rounded-xs bg-border/20" />
                              </div>
                              <div className="h-6 w-16 animate-pulse rounded-xs bg-border/25" />
                            </div>
                          ))}
                        </div>
                      ) : filteredCarparks.length === 0 ? (
                        <div className="space-y-3 p-6">
                          <p className="text-body font-medium text-foreground">
                            No Singapore carparks match these filters
                          </p>
                          <p className="text-xs text-muted">
                            Try clearing the search query, switching vehicle class back to Cars (C), or zooming out to All Singapore.
                          </p>
                          <Button tone="quiet" onClick={resetLiveFilters}>
                            Reset all filters
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="divide-y divide-border/40">
                            {visibleDirectoryRows.map((cp) => {
                              const lot = getLotEntry(cp, selectedLotType);
                              const avail = lot?.lotsAvailable ?? 0;
                              const total = lot?.totalLots ?? 0;
                              const band = getAvailabilityBand(avail, total);
                              const bandWord = getBandLabel(band);
                              const isSelected = selectedCarpark?.id === cp.id;
                              const isSaved = savedIds.includes(cp.id);
                              const oneHrFee = calculateParkingFeeCents(
                                cp,
                                selectedLotType,
                                60,
                                false
                              );
                              const statusClass =
                                band === 'ample'
                                  ? 'text-primary'
                                  : band === 'moderate'
                                    ? 'text-accent'
                                    : 'text-danger';

                              return (
                                <div
                                  key={cp.id}
                                  className={`flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-150 ${
                                    isSelected
                                      ? 'bg-background'
                                      : 'hover:bg-background/50'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedId(cp.id);
                                      setMobileInspectorOpen(true);
                                    }}
                                    className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                  >
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                                        <span
                                          className={`inline-block h-2 w-2 rounded-xs ${
                                            band === 'ample'
                                              ? 'bg-primary'
                                              : band === 'moderate'
                                                ? 'bg-accent'
                                                : 'bg-danger'
                                          }`}
                                        />
                                        {cp.agency}
                                      </span>
                                      <span>·</span>
                                      <span className="font-mono text-foreground">
                                        {cp.id}
                                      </span>
                                      <span>·</span>
                                      <span>{cp.planningArea}</span>
                                      <span>·</span>
                                      <span className="tabular-nums">
                                        {formatSGD(oneHrFee.feeCents)}/hr
                                      </span>
                                    </div>

                                    <p className="mt-1 text-body font-semibold text-foreground">
                                      {cp.name}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted">
                                      {cp.expresswayExit} · {cp.gantryHeightM.toFixed(2)}m gantry
                                    </p>
                                  </button>

                                  <div className="flex shrink-0 items-center gap-3">
                                    <div className="text-right tabular-nums">
                                      {lot ? (
                                        <>
                                          <p className="text-title font-semibold text-foreground">
                                            {formatInt(avail)}
                                          </p>
                                          <p className="text-xs text-muted">
                                            <span
                                              className={`font-medium ${statusClass}`}
                                            >
                                              {bandWord}
                                            </span>{' '}
                                            / {formatInt(total)}
                                          </p>
                                        </>
                                      ) : (
                                        <p className="text-xs text-muted">
                                          No bays
                                        </p>
                                      )}
                                    </div>

                                    <button
                                      type="button"
                                      aria-label={
                                        isSaved
                                          ? `Remove ${cp.name} from saved`
                                          : `Save ${cp.name}`
                                      }
                                      aria-pressed={isSaved}
                                      onClick={() => handleToggleSave(cp.id)}
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-border/50 bg-surface text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                    >
                                      <Bookmark
                                        className={`h-4 w-4 ${
                                          isSaved
                                            ? 'fill-current text-primary'
                                            : ''
                                        }`}
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {filteredCarparks.length > 9 ? (
                            <div className="px-4 py-3">
                              <Button
                                tone="quiet"
                                onClick={() => setShowAllRows((prev) => !prev)}
                                className="w-full"
                              >
                                {showAllRows
                                  ? 'Show top 9 carparks'
                                  : `Show all ${filteredCarparks.length} carparks`}
                              </Button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </Surface>
                  </div>

                  {/* Right Column: Sticky Carpark Inspector on Desktop */}
                  <div className="hidden min-w-0 lg:col-span-5 lg:block lg:sticky lg:top-5 lg:self-start">
                    {selectedCarpark ? (
                      <CarparkInspector
                        carpark={selectedCarpark}
                        selectedLotType={selectedLotType}
                        isSaved={savedIds.includes(selectedCarpark.id)}
                        isActiveSessionHere={
                          activeSession?.carparkId === selectedCarpark.id
                        }
                        onToggleSave={handleToggleSave}
                        onStartParkingSession={handleStartParkingSession}
                      />
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            {/* VIEW 2: SAVED & PARKED */}
            {activeView === 'saved' ? (
              <SavedAndParkedView
                carparks={carparks}
                savedIds={savedIds}
                activeSession={activeSession}
                selectedLotType={selectedLotType}
                onStartSession={handleStartParkingSession}
                onEndSession={handleEndParkingSession}
                onRestoreSession={handleRestoreParkingSession}
                onToggleSave={handleToggleSave}
                onInspectCarpark={handleSelectAndInspect}
                onResetAll={handleResetAll}
              />
            ) : null}

            {/* VIEW 3: CORRIDOR ANALYTICS */}
            {activeView === 'analytics' ? (
              <CorridorAnalyticsView
                carparks={carparks}
                selectedLotType={selectedLotType}
                onInspectCarpark={handleSelectAndInspect}
              />
            ) : null}

            {/* VIEW 4: BACKEND INTEGRATION CONTRACT */}
            {activeView === 'contract' && selectedCarpark ? (
              <BackendContractView
                sampleCarpark={selectedCarpark}
                pollingSeconds={pollingSeconds}
                onPollingSecondsChange={setPollingSeconds}
                diagnosticMode={diagnosticMode}
                onDiagnosticModeChange={setDiagnosticMode}
                onTriggerRefresh={handleManualRefresh}
                isRefreshing={isRefreshing}
              />
            ) : null}
          </main>
        </div>

        {/* Mobile Bottom Tab Navigation (< md) */}
        <nav
          aria-label="Mobile navigation"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border/40 bg-surface md:hidden"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveView(item.id);
                  if (item.id === 'live') {
                    setMobileInspectorOpen(false);
                  }
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 whitespace-nowrap px-1 text-xs font-medium ${
                  active ? 'text-primary' : 'text-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </MotionConfig>
  );
}
