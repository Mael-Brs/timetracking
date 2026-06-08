import { load as defaultLoad, save as defaultSave, getToday as defaultGetToday, getCurrentTime as defaultGetCurrentTime, DayEntry, Data } from './storage.js';

interface Deps {
  load: () => Data;
  save: (data: Data) => void;
  getToday: () => string;
  getCurrentTime: () => string;
}

export interface StartResult {
  error?: string;
  message?: string;
  time?: string;
}

export interface PauseResult {
  error?: string;
  message?: string;
  time?: string;
  workedMinutes?: number;
}

export interface EndResult {
  error?: string;
  message?: string;
  time?: string;
  workedMinutes?: number;
}

export interface UnclosedSession {
  date: string;
  start: string;
}

export interface StatusResult {
  message?: string;
  sessions: { start: string; end: string | null }[];
  workedMinutes: number;
  isWorking: boolean;
  targetMinutes: number;
  todayBalanceMinutes: number;
  cumulativeBalanceMinutes: number;
  unclosedSessions: UnclosedSession[];
}

export interface DaySummary {
  date: string;
  minutes: number;
  isToday: boolean;
  targetMinutes: number;
  balanceMinutes: number;
}

export interface WeekResult {
  days: DaySummary[];
  totalMinutes: number;
  targetMinutes: number;
  balanceMinutes: number;
  carryOverMinutes: number;
  totalBalanceMinutes: number;
  unclosedSessions: UnclosedSession[];
}

export interface FixResult {
  error?: string;
  message?: string;
  workedMinutes?: number;
}

function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getDayTarget(dateStr: string): number {
  return isWeekend(dateStr) ? 0 : 7 * 60;
}

function calculateDayMinutes(entry: DayEntry): number {
  let total = 0;
  for (const session of entry.sessions) {
    if (session.end !== null) {
      total += getMinutesBetween(session.start, session.end);
    }
  }
  return total;
}

function getMinutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function hasOpenSession(entry: DayEntry): boolean {
  return entry.sessions.at(-1)?.end === null;
}

function collectUnclosedPastSessions(data: Data, today: string): UnclosedSession[] {
  return Object.entries(data.entries)
    .filter(([date, entry]) => date < today && hasOpenSession(entry))
    .map(([date, entry]) => ({ date, start: entry.sessions.at(-1)!.start }));
}

export function makeTracker(deps: Deps) {
  const { load, save, getToday, getCurrentTime } = deps;

  function getMinutesSince(start: string): number {
    return getMinutesBetween(start, getCurrentTime());
  }

  function archivePastDays(data: Data): void {
    const today = getToday();
    const entriesToArchive = Object.keys(data.entries).filter(
      (date) => date < today && !hasOpenSession(data.entries[date])
    );

    if (entriesToArchive.length === 0) return;

    let balanceToAdd = 0;
    for (const date of entriesToArchive) {
      balanceToAdd += calculateDayMinutes(data.entries[date]) - getDayTarget(date);
      delete data.entries[date];
    }

    data.balanceCarryOver = (data.balanceCarryOver ?? 0) + balanceToAdd;
    save(data);
  }

  function start(overrideTime?: string): StartResult {
    const data = load();
    const today = getToday();
    const time = overrideTime ?? getCurrentTime();

    if (!data.entries[today]) {
      data.entries[today] = { sessions: [] };
    }

    const sessions = data.entries[today].sessions;
    const lastSession = sessions.at(-1);

    if (lastSession?.end === null) {
      return { error: `Already working since ${lastSession.start}` };
    }

    sessions.push({ start: time, end: null });
    save(data);

    return { message: `Started at ${time}`, time };
  }

  function pause(overrideTime?: string): PauseResult {
    const data = load();
    const today = getToday();
    const time = overrideTime ?? getCurrentTime();

    if (!data.entries[today] || data.entries[today].sessions.length === 0) {
      return { error: 'No work session started today' };
    }

    const sessions = data.entries[today].sessions;
    const lastSession = sessions.at(-1)!;

    if (lastSession.end !== null) {
      return { error: 'No active session to pause' };
    }

    lastSession.end = time;
    save(data);

    return { message: `Paused at ${time}`, time, workedMinutes: calculateDayMinutes(data.entries[today]) };
  }

  function end(overrideTime?: string): EndResult {
    const data = load();
    const today = getToday();
    const time = overrideTime ?? getCurrentTime();

    if (!data.entries[today] || data.entries[today].sessions.length === 0) {
      return { error: 'No work session started today' };
    }

    const sessions = data.entries[today].sessions;
    const lastSession = sessions.at(-1)!;

    lastSession.end ??= time;
    save(data);

    return { message: `Ended at ${time}`, time, workedMinutes: calculateDayMinutes(data.entries[today]) };
  }

  function status(): StatusResult {
    const data = load();
    archivePastDays(data);

    const freshData = load();
    const today = getToday();
    const targetMinutes = getDayTarget(today);
    const carryOver = freshData.balanceCarryOver ?? 0;
    const unclosedSessions = collectUnclosedPastSessions(freshData, today);

    if (!freshData.entries[today] || freshData.entries[today].sessions.length === 0) {
      return {
        message: 'No work logged today',
        sessions: [],
        workedMinutes: 0,
        isWorking: false,
        targetMinutes,
        todayBalanceMinutes: -targetMinutes,
        cumulativeBalanceMinutes: carryOver - targetMinutes,
        unclosedSessions,
      };
    }

    const entry = freshData.entries[today];
    const sessions = entry.sessions;
    const lastSession = sessions.at(-1)!;
    const isWorking = lastSession.end === null;

    let workedMinutes = calculateDayMinutes(entry);
    if (isWorking) {
      workedMinutes += getMinutesSince(lastSession.start);
    }

    const todayBalanceMinutes = workedMinutes - targetMinutes;
    const cumulativeBalanceMinutes = carryOver + todayBalanceMinutes;

    return {
      sessions,
      workedMinutes,
      isWorking,
      targetMinutes,
      todayBalanceMinutes,
      cumulativeBalanceMinutes,
      unclosedSessions,
    };
  }

  function week(): WeekResult {
    const data = load();
    archivePastDays(data);

    const freshData = load();
    const today = new Date(getToday());
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    const todayStr = getToday();
    const days: DaySummary[] = [];
    let totalMinutes = 0;
    let totalTargetMinutes = 0;

    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const entry = freshData.entries[dateStr];

      let minutes = 0;
      if (entry) {
        minutes = calculateDayMinutes(entry);
        const lastSession = entry.sessions.at(-1);
        if (lastSession?.end === null && dateStr === todayStr) {
          minutes += getMinutesSince(lastSession.start);
        }
      }

      const isTodayFlag = dateStr === todayStr;
      const dayTarget = getDayTarget(dateStr);
      const dayBalance = minutes - dayTarget;

      days.push({ date: dateStr, minutes, isToday: isTodayFlag, targetMinutes: dayTarget, balanceMinutes: dayBalance });
      totalMinutes += minutes;
      totalTargetMinutes += dayTarget;
    }

    const balanceMinutes = totalMinutes - totalTargetMinutes;
    const carryOverMinutes = freshData.balanceCarryOver ?? 0;
    const totalBalanceMinutes = balanceMinutes + carryOverMinutes;
    const unclosedSessions = collectUnclosedPastSessions(freshData, todayStr);

    return { days, totalMinutes, targetMinutes: totalTargetMinutes, balanceMinutes, carryOverMinutes, totalBalanceMinutes, unclosedSessions };
  }

  function fix(date: string, endTime: string): FixResult {
    const today = getToday();

    if (date >= today) {
      return { error: 'Can only fix past days' };
    }

    const data = load();
    const entry = data.entries[date];

    if (!entry) {
      return { error: `No entry found for ${date}` };
    }

    const lastSession = entry.sessions.at(-1);
    if (!lastSession || lastSession.end !== null) {
      return { error: `No open session found for ${date}` };
    }

    if (getMinutesBetween(lastSession.start, endTime) <= 0) {
      return { error: `End time ${endTime} is before or equal to start time ${lastSession.start}` };
    }

    lastSession.end = endTime;

    const worked = calculateDayMinutes(entry);
    const balance = worked - getDayTarget(date);
    data.balanceCarryOver = (data.balanceCarryOver ?? 0) + balance;
    delete data.entries[date];
    save(data);

    return { message: `Fixed ${date}: closed at ${endTime}`, workedMinutes: worked };
  }

  return { start, pause, end, status, week, fix };
}

const defaultDeps: Deps = {
  load: defaultLoad,
  save: defaultSave,
  getToday: defaultGetToday,
  getCurrentTime: defaultGetCurrentTime,
};

const defaultTracker = makeTracker(defaultDeps);

export const start = defaultTracker.start;
export const pause = defaultTracker.pause;
export const end = defaultTracker.end;
export const status = defaultTracker.status;
export const week = defaultTracker.week;
export const fix = defaultTracker.fix;