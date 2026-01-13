import fs from 'node:fs';
import path from 'node:path';

export interface Session {
  start: string;
  end: string | null;
}

export interface DayEntry {
  sessions: Session[];
}

export interface Data {
  entries: Record<string, DayEntry>;
  balanceCarryOver?: number; // Minutes carried over from archived weeks
}

const DATA_DIR = path.join(import.meta.dirname, '..', '..');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function load(): Data {
  ensureDataDir();

  if (!fs.existsSync(DATA_FILE)) {
    return { entries: {} };
  }

  const content = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(content) as Data;
}

export function save(data: Data): void {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getToday(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

export function getCurrentTime(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 5);
}
