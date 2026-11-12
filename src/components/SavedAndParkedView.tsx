import React, { useEffect, useState } from 'react';
import { BookmarkMinus, Car, Clock, Plus, RotateCcw } from 'lucide-react';
import type {
  ActiveParkingSession,
  CarparkRecord,
  LotType,
} from '../types/carpark';
import {
  calculateParkingFeeCents,
  formatInt,
  formatSGD,
  getAvailabilityBand,
  getBandLabel,
  getLotEntry,
} from '../utils/carparkMath';
import { Button, Field, Surface } from './ui';

interface SavedAndParkedViewProps {
  carparks: CarparkRecord[];
  savedIds: string[];
  activeSession: ActiveParkingSession | null;
  selectedLotType: LotType;
  onStartSession: (
    carparkId: string,
    lotType: LotType,
    deckAndLot: string,
    plannedDurationMins: number
  ) => void;
  onEndSession: () => void;
  onRestoreSession: (session: ActiveParkingSession) => void;
  onToggleSave: (id: string) => void;
  onInspectCarpark: (id: string) => void;
  onResetAll: () => void;
}

const LOT_TYPE_NAME: Record<LotType, string> = {
  C: 'Car (C)',
  Y: 'Motorcycle (Y)',
  H: 'Heavy vehicle (H)',
};

export const SavedAndParkedView: React.FC<SavedAndParkedViewProps> = ({
  carparks,
  savedIds,
  activeSession,
  selectedLotType,
  onStartSession,
  onEndSession,
  onRestoreSession,
  onToggleSave,
  onInspectCarpark,
  onResetAll,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [undoSession, setUndoSession] = useState<ActiveParkingSession | null>(
    null
  );
  const [undoRemovedId, setUndoRemovedId] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Quick-start form state when no active parking session exists
  const [formCarparkId, setFormCarparkId] = useState<string>(
    savedIds[0] ?? carparks[0]?.id ?? 'TP12'
  );
  const [formLotType, setFormLotType] = useState<LotType>(selectedLotType);
  const [formDeckNote, setFormDeckNote] = useState<string>('Deck 2B · Lot 64');

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const sessionCarpark = activeSession
    ? carparks.find((c) => c.id === activeSession.carparkId) ?? null
    : null;

  const elapsedMins = activeSession
    ? Math.max(1, Math.round((nowMs - activeSession.startedAtMs) / 60000))
    : 0;

  const isSunday = new Date(nowMs).getDay() === 0;
  const accruedFee =
    activeSession && sessionCarpark
      ? calculateParkingFeeCents(
          sessionCarpark,
          activeSession.lotType,
          elapsedMins,
          isSunday
        )
      : null;

  const minsIntoCurrentHalfHour = elapsedMins % 30;
  const minsUntilNextBlock =
    minsIntoCurrentHalfHour === 0 ? 30 : 30 - minsIntoCurrentHalfHour;

  const savedCarparks = carparks.filter((cp) => savedIds.includes(cp.id));

  return (
    <div className="space-y-6">
      {/* Status / Undo Banner */}
      {undoSession || undoRemovedId ? (
        <Surface className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p role="status" aria-live="polite" className="text-body text-foreground">
            {undoSession
              ? `Ended parking session (${undoSession.deckAndLot})`
              : `Removed '${undoRemovedId?.name}' from saved carparks`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              tone="quiet"
              className="min-h-9 px-3 text-xs"
              onClick={() => {
                if (undoSession) {
                  onRestoreSession(undoSession);
                  setUndoSession(null);
                } else if (undoRemovedId) {
                  onToggleSave(undoRemovedId.id);
                  setUndoRemovedId(null);
                }
              }}
            >
              Undo
            </Button>
          </div>
        </Surface>
      ) : null}

      {/* Active Parked Vehicle Session Panel */}
      <Surface className="divide-y divide-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-title font-semibold text-foreground">
              Active parking session
            </h2>
            <p className="text-xs text-muted">
              Live elapsed stay and estimated EPS deduction based on published half-hour blocks
            </p>
          </div>
          {activeSession ? (
            <Button
              tone="danger"
              onClick={() => {
                setUndoSession(activeSession);
                onEndSession();
              }}
            >
              End parking session
            </Button>
          ) : null}
        </div>

        {activeSession && sessionCarpark && accruedFee ? (
          <>
            {/* Lead & secondary figures parted strictly by 1px rules */}
            <div className="grid grid-cols-1 divide-y divide-border/40 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <div className="p-5">
                <p className="text-xs text-muted">Estimated EPS charge</p>
                <p className="mt-1 text-display font-semibold text-foreground tabular-nums">
                  {formatSGD(accruedFee.feeCents)}
                </p>
                <p className="mt-1 text-xs text-muted">{accruedFee.note}</p>
              </div>

              <div className="p-5">
                <p className="text-xs text-muted">Elapsed time</p>
                <p className="mt-1 text-title font-semibold text-foreground tabular-nums">
                  {Math.floor(elapsedMins / 60)}h {elapsedMins % 60}m
                </p>
                <p className="mt-1 text-xs text-muted tabular-nums">
                  Entered{' '}
                  {new Date(activeSession.startedAtMs).toLocaleTimeString(
                    'en-SG',
                    {
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  )}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs text-muted">Next 30-min block</p>
                <p className="mt-1 text-title font-semibold text-foreground tabular-nums">
                  in {minsUntilNextBlock} min
                </p>
                <p className="mt-1 text-xs text-muted">
                  Grace: {sessionCarpark.gracePeriodMins} mins
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs text-muted">Recorded bay & class</p>
                <p className="mt-1 text-body font-semibold text-foreground">
                  {activeSession.deckAndLot}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {LOT_TYPE_NAME[activeSession.lotType]} ·{' '}
                  <span className="font-mono text-foreground">
                    {sessionCarpark.id}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-xs text-muted">
              <span>
                Parked at{' '}
                <strong className="font-semibold text-foreground">
                  {sessionCarpark.name}
                </strong>{' '}
                ({sessionCarpark.address})
              </span>
              <Button
                tone="quiet"
                className="min-h-9 px-3 text-xs"
                onClick={() => onInspectCarpark(sessionCarpark.id)}
              >
                Open on locator map
              </Button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onStartSession(
                formCarparkId,
                formLotType,
                formDeckNote.trim() || 'Level 2 · General bay',
                90
              );
              setUndoSession(null);
            }}
            className="space-y-4 p-5"
          >
            <div className="flex items-center gap-2 text-body text-muted">
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>
                No active parking timer. Record your carpark and deck bay below when you pass an EPS gantry.
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Carpark" htmlFor="session-cp-select">
                <select
                  id="session-cp-select"
                  value={formCarparkId}
                  onChange={(e) => setFormCarparkId(e.target.value)}
                  className="min-h-11 w-full rounded-control border border-border/60 bg-surface px-3 text-body text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {carparks.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name} ({cp.id})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Vehicle class" htmlFor="session-lot-select">
                <select
                  id="session-lot-select"
                  value={formLotType}
                  onChange={(e) => setFormLotType(e.target.value as LotType)}
                  className="min-h-11 w-full rounded-control border border-border/60 bg-surface px-3 text-body text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <option value="C">Car (C)</option>
                  <option value="Y">Motorcycle (Y)</option>
                  <option value="H">Heavy vehicle (H)</option>
                </select>
              </Field>

              <Field label="Deck & lot marker" htmlFor="session-deck-input">
                <input
                  id="session-deck-input"
                  type="text"
                  value={formDeckNote}
                  onChange={(e) => setFormDeckNote(e.target.value)}
                  placeholder="e.g. Deck 4A · Pillar C8"
                  className="min-h-11 w-full rounded-control border border-border/60 bg-surface px-3 text-body text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
              </Field>
            </div>

            <div>
              <Button type="submit" tone="primary">
                <Car className="h-4 w-4" aria-hidden="true" />
                Start parking timer
              </Button>
            </div>
          </form>
        )}
      </Surface>

      {/* Saved Commuter Carparks Table */}
      <Surface className="divide-y divide-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-title font-semibold text-foreground">
              Saved commuter carparks ({savedCarparks.length})
            </h2>
            <p className="text-xs text-muted">
              Side-by-side live lot availability and 1-hour weekday tariff for your bookmarked stops
            </p>
          </div>
          <Button
            tone="quiet"
            onClick={onResetAll}
            className="min-h-9 px-3 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset saved defaults
          </Button>
        </div>

        {savedCarparks.length === 0 ? (
          <div className="space-y-3 p-6">
            <p className="text-body font-medium text-foreground">
              No saved carparks yet
            </p>
            <p className="max-w-[44ch] text-body text-muted">
              Bookmark frequent HDB town hubs or CBD office carparks from the live locator to compare bay availability before you set off.
            </p>
            <Button
              tone="primary"
              onClick={() => onInspectCarpark(carparks[0]?.id ?? 'ACB')}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Browse live carparks
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="px-5 py-3">Carpark & agency</th>
                  <th className="px-4 py-3">Corridor</th>
                  <th className="px-4 py-3 text-right">
                    Available ({selectedLotType})
                  </th>
                  <th className="px-4 py-3 text-right">1-hr weekday</th>
                  <th className="px-4 py-3 text-right">Clearance</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-body">
                {savedCarparks.map((cp) => {
                  const lot = getLotEntry(cp, selectedLotType);
                  const oneHr = calculateParkingFeeCents(
                    cp,
                    selectedLotType,
                    60,
                    false
                  );
                  const band = lot
                    ? getAvailabilityBand(lot.lotsAvailable, lot.totalLots)
                    : 'full';
                  const statusColor =
                    band === 'ample'
                      ? 'text-primary'
                      : band === 'moderate'
                        ? 'text-accent'
                        : 'text-danger';

                  return (
                    <tr key={cp.id} className="hover:bg-background/60">
                      <td className="px-5 py-3.5">
                        <button
                          type="button"
                          onClick={() => onInspectCarpark(cp.id)}
                          className="text-left font-medium text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {cp.name}
                        </button>
                        <p className="text-xs text-muted">
                          {cp.agency} · <span className="font-mono">{cp.id}</span> ·{' '}
                          {cp.paymentSystem}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted">
                        <span className="text-foreground">{cp.planningArea}</span>
                        <br />
                        {cp.expresswayExit}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {lot ? (
                          <div>
                            <span className="font-semibold text-foreground">
                              {formatInt(lot.lotsAvailable)}
                            </span>
                            <span className="text-xs text-muted">
                              {' '}
                              / {formatInt(lot.totalLots)}
                            </span>
                            <div className={`text-xs font-medium ${statusColor}`}>
                              {getBandLabel(band)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">No bays</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-foreground tabular-nums">
                        {formatSGD(oneHr.feeCents)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-muted tabular-nums">
                        {cp.gantryHeightM.toFixed(2)} m
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            tone="quiet"
                            className="min-h-9 px-3 text-xs"
                            onClick={() => onInspectCarpark(cp.id)}
                          >
                            Inspect
                          </Button>
                          <Button
                            tone="ghost"
                            aria-label={`Remove ${cp.name} from saved`}
                            className="min-h-9 px-2.5 text-xs text-muted hover:text-danger"
                            onClick={() => {
                              setUndoRemovedId({ id: cp.id, name: cp.name });
                              onToggleSave(cp.id);
                            }}
                          >
                            <BookmarkMinus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
};
