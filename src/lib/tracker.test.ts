import { describe, it, expect } from 'vitest';
import { makeTracker } from './tracker.js';
import type { Data } from './storage.js';

function makeStore(initial: Data) {
  let data = structuredClone(initial);
  return {
    load: () => structuredClone(data),
    save: (d: Data) => { data = structuredClone(d); },
    getData: () => data,
  };
}

function deps(store: ReturnType<typeof makeStore>, today: string, now: string) {
  return {
    load: store.load,
    save: store.save,
    getToday: () => today,
    getCurrentTime: () => now,
  };
}

// 2026-06-04 = Thursday (weekday, target 420min)
// 2026-06-08 = Monday  (weekday, "today" in most tests)

// ─── archivePastDays ──────────────────────────────────────────────────────────

describe('archivePastDays', () => {
  it('skips a past day with an unclosed session (does not archive, does not alter balance)', () => {
    const store = makeStore({
      entries: {
        '2026-06-04': { sessions: [{ start: '09:00', end: null }] },
      },
    });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    tracker.status();

    expect(store.getData().entries['2026-06-04']).toBeDefined();
    expect(store.getData().balanceCarryOver).toBeUndefined();
  });

  it('archives a past day with all sessions closed', () => {
    // 2026-06-04 Thu: 09:00-17:00 = 480min worked, target 420min → +60min
    const store = makeStore({
      entries: {
        '2026-06-04': { sessions: [{ start: '09:00', end: '17:00' }] },
      },
    });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    tracker.status();

    expect(store.getData().entries['2026-06-04']).toBeUndefined();
    expect(store.getData().balanceCarryOver).toBe(60);
  });

  it('archives closed days but retains unclosed ones in the same pass', () => {
    const store = makeStore({
      entries: {
        '2026-06-04': { sessions: [{ start: '09:00', end: '17:00' }] },
        '2026-06-05': { sessions: [{ start: '09:00', end: null }] },
      },
    });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    tracker.status();

    expect(store.getData().entries['2026-06-04']).toBeUndefined();
    expect(store.getData().entries['2026-06-05']).toBeDefined();
    expect(store.getData().balanceCarryOver).toBe(60);
  });
});

// ─── status warnings ──────────────────────────────────────────────────────────

describe('status', () => {
  it('returns unclosedSessions list when a past day has an open session', () => {
    const store = makeStore({
      entries: {
        '2026-06-04': { sessions: [{ start: '09:00', end: null }] },
      },
    });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    const result = tracker.status();

    expect(result.unclosedSessions).toEqual([{ date: '2026-06-04', start: '09:00' }]);
  });

  it('returns empty unclosedSessions when all past days are clean', () => {
    const store = makeStore({ entries: {} });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    const result = tracker.status();

    expect(result.unclosedSessions).toEqual([]);
  });
});

// ─── week warnings ────────────────────────────────────────────────────────────

describe('week', () => {
  it('returns unclosedSessions list when a past day has an open session', () => {
    const store = makeStore({
      entries: {
        '2026-06-04': { sessions: [{ start: '09:00', end: null }] },
      },
    });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    const result = tracker.week();

    expect(result.unclosedSessions).toEqual([{ date: '2026-06-04', start: '09:00' }]);
  });
});

// ─── fix ─────────────────────────────────────────────────────────────────────

describe('fix', () => {
  it('closes the open session on the given date and archives the day', () => {
    const store = makeStore({
      entries: {
        '2026-06-04': { sessions: [{ start: '09:00', end: null }] },
      },
    });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    const result = tracker.fix('2026-06-04', '17:00');

    expect(result.error).toBeUndefined();
    expect(store.getData().entries['2026-06-04']).toBeUndefined();
    expect(store.getData().balanceCarryOver).toBe(60); // 480 - 420
  });

  it('returns error when the date has no entry', () => {
    const store = makeStore({ entries: {} });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    const result = tracker.fix('2026-06-04', '17:00');

    expect(result.error).toMatch(/no entry/i);
  });

  it('returns error when the date has no open session', () => {
    const store = makeStore({
      entries: {
        '2026-06-04': { sessions: [{ start: '09:00', end: '17:00' }] },
      },
    });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    const result = tracker.fix('2026-06-04', '18:00');

    expect(result.error).toMatch(/no open session/i);
  });

  it('returns error when end time is before start time', () => {
    const store = makeStore({
      entries: {
        '2026-06-04': { sessions: [{ start: '09:00', end: null }] },
      },
    });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    const result = tracker.fix('2026-06-04', '08:00');

    expect(result.error).toMatch(/before/i);
  });

  it('returns error when the date is today or in the future', () => {
    const store = makeStore({
      entries: {
        '2026-06-08': { sessions: [{ start: '09:00', end: null }] },
      },
    });
    const tracker = makeTracker(deps(store, '2026-06-08', '10:00'));

    const result = tracker.fix('2026-06-08', '17:00');

    expect(result.error).toMatch(/past/i);
  });
});