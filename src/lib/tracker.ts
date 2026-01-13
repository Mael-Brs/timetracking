import { load, save, getToday, getCurrentTime, DayEntry } from './storage.js';

interface StartResult {
  error?: string;
  message?: string;
  time?: string;
}

interface PauseResult {
  error?: string;
  message?: string;
  time?: string;
  workedMinutes?: number;
}

interface EndResult {
  error?: string;
  message?: string;
  time?: string;
  workedMinutes?: number;
}

interface StatusResult {
  message?: string;
  sessions: { start: string; end: string | null }[];
  workedMinutes: number;
  isWorking: boolean;
  targetMinutes: number;
  todayBalanceMinutes: number;
  cumulativeBalanceMinutes: number;
}

interface DaySummary {
  date: string;
  minutes: number;
  isToday: boolean;
  targetMinutes: number;
  balanceMinutes: number;
}

interface WeekResult {
  days: DaySummary[];
  totalMinutes: number;
  targetMinutes: number;
  balanceMinutes: number;
  carryOverMinutes: number;
  totalBalanceMinutes: number;
}

export function start(overrideTime?: string): StartResult {
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

export function pause(overrideTime?: string): PauseResult {
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

  const worked = calculateDayMinutes(data.entries[today]);
  return { message: `Paused at ${time}`, time, workedMinutes: worked };
}

export function end(overrideTime?: string): EndResult {
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

  const worked = calculateDayMinutes(data.entries[today]);
  return { message: `Ended at ${time}`, time, workedMinutes: worked };
}

function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getDayTarget(dateStr: string): number {
  return isWeekend(dateStr) ? 0 : 7 * 60;
}

function archivePastDays(): void {
  const data = load();
  const today = getToday();
  const entriesToArchive: string[] = [];

  for (const dateStr of Object.keys(data.entries)) {
    if (dateStr < today) {
      entriesToArchive.push(dateStr);
    }
  }

  if (entriesToArchive.length === 0) {
    return;
  }

  let balanceToAdd = 0;
  for (const dateStr of entriesToArchive) {
    const entry = data.entries[dateStr];
    const worked = calculateDayMinutes(entry);
    const target = getDayTarget(dateStr);
    balanceToAdd += worked - target;
    delete data.entries[dateStr];
  }

  const previousCarryOver = data.balanceCarryOver || 0;
  data.balanceCarryOver = previousCarryOver + balanceToAdd;
  save(data);
}

export function status(): StatusResult {
  archivePastDays();

  const data = load();
  const today = getToday();
  const targetMinutes = getDayTarget(today);
  const carryOver = data.balanceCarryOver || 0;

  if (!data.entries[today] || data.entries[today].sessions.length === 0) {
    return {
      message: 'No work logged today',
      sessions: [],
      workedMinutes: 0,
      isWorking: false,
      targetMinutes,
      todayBalanceMinutes: -targetMinutes,
      cumulativeBalanceMinutes: carryOver - targetMinutes,
    };
  }

  const entry = data.entries[today];
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
  };
}

export function week(): WeekResult {
  archivePastDays();

  const data = load();
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  const days: DaySummary[] = [];
  let totalMinutes = 0;
  let totalTargetMinutes = 0;

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const entry = data.entries[dateStr];

    let minutes = 0;
    if (entry) {
      minutes = calculateDayMinutes(entry);
      const lastSession = entry.sessions.at(-1);
      if (lastSession?.end === null) {
        minutes += getMinutesSince(lastSession.start);
      }
    }

    const isTodayFlag = dateStr === getToday();
    const dayTarget = getDayTarget(dateStr);
    const dayBalance = minutes - dayTarget;

    days.push({ date: dateStr, minutes, isToday: isTodayFlag, targetMinutes: dayTarget, balanceMinutes: dayBalance });
    totalMinutes += minutes;
    totalTargetMinutes += dayTarget;
  }

  const targetMinutes = totalTargetMinutes;
  const balanceMinutes = totalMinutes - targetMinutes;
  const carryOverMinutes = data.balanceCarryOver || 0;
  const totalBalanceMinutes = balanceMinutes + carryOverMinutes;

  return { days, totalMinutes, targetMinutes, balanceMinutes, carryOverMinutes, totalBalanceMinutes };
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

function getMinutesSince(start: string): number {
  const now = getCurrentTime();
  return getMinutesBetween(start, now);
}

