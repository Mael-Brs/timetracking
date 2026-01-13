const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDuration(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;

  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

export function formatBalance(minutes: number): string {
  const formatted = formatDuration(minutes);
  if (minutes >= 0) {
    return `+${formatted}`;
  }
  return `-${formatted}`;
}

export function getDayName(dateStr: string): string {
  const date = new Date(dateStr);
  return DAYS[date.getDay()];
}

type ColorName = 'green' | 'red' | 'yellow' | 'cyan' | 'dim';

export function colorize(text: string, color: ColorName): string {
  const colors: Record<ColorName | 'reset', string> = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    reset: '\x1b[0m'
  };
  return `${colors[color] || ''}${text}${colors.reset}`;
}
