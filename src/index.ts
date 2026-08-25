#!/usr/bin/env node

import { start, pause, end, status, week, fix, half } from './lib/tracker.js';
import { formatDuration, formatBalance, getDayName, colorize } from './lib/display.js';

const command = process.argv[2];
const timeArg = process.argv[3];

function parseTime(arg: string | undefined): string | undefined {
  if (!arg) return undefined;

  const match = arg.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    console.log(colorize(`Invalid time format: ${arg}. Use HH:MM (e.g., 09:30)`, 'red'));
    process.exit(1);
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    console.log(colorize(`Invalid time: ${arg}. Hours must be 0-23, minutes 0-59`, 'red'));
    process.exit(1);
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function parseDate(arg: string | undefined): string {
  if (!arg) {
    console.log(colorize('Missing date argument. Use YYYY-MM-DD (e.g., 2026-06-04)', 'red'));
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    console.log(colorize(`Invalid date format: ${arg}. Use YYYY-MM-DD`, 'red'));
    process.exit(1);
  }
  return arg;
}

function showHelp(): void {
  console.log(`
Time Tracking CLI

Usage: tt <command> [args]

Commands:
  start [HH:MM]              Start work or resume after break
  pause [HH:MM]              Pause for lunch/break
  end [HH:MM]                End work day
  status                     Show today's progress and balance
  week                       Show weekly summary with balance
  half                       Set today's target to half a day (3h30)
  fix <YYYY-MM-DD> <HH:MM>   Close a forgotten open session on a past day

Examples:
  tt start          # Start working now
  tt start 9:00     # Start working at 9:00 (forgot to log earlier)
  tt pause 12:30    # Log a pause at 12:30
  tt start 13:00    # Resume work at 13:00
  tt end 17:30      # End the day at 17:30
  tt fix 2026-06-04 17:30   # Close forgotten session from June 4th
`);
}

function printUnclosedWarnings(unclosed: { date: string; start: string }[]): void {
  for (const { date, start } of unclosed) {
    console.log(colorize(`⚠ Unclosed session on ${date} (started ${start}) — run: tt fix ${date} HH:MM`, 'yellow'));
  }
  if (unclosed.length > 0) console.log('');
}

function handleStart(): void {
  const time = parseTime(timeArg);
  const result = start(time);
  if (result.error) {
    console.log(colorize(result.error, 'yellow'));
  } else {
    console.log(colorize(`Started at ${result.time}`, 'green'));
  }
}

function handlePause(): void {
  const time = parseTime(timeArg);
  const result = pause(time);
  if (result.error) {
    console.log(colorize(result.error, 'yellow'));
  } else {
    console.log(`Paused at ${result.time} (worked ${formatDuration(result.workedMinutes!)})`);
  }
}

function handleEnd(): void {
  const time = parseTime(timeArg);
  const result = end(time);
  if (result.error) {
    console.log(colorize(result.error, 'yellow'));
  } else {
    console.log(colorize(`Ended at ${result.time}`, 'green') + ` (worked ${formatDuration(result.workedMinutes!)} today)`);
  }
}

function handleStatus(): void {
  const result = status();

  printUnclosedWarnings(result.unclosedSessions);

  if (result.sessions.length === 0) {
    console.log(colorize('No work logged today', 'dim'));
    console.log('');
    console.log(`Target: ${formatDuration(result.targetMinutes)}`);
    console.log(`Today's balance: ${colorize(formatBalance(result.todayBalanceMinutes), result.todayBalanceMinutes >= 0 ? 'green' : 'red')}`);
    console.log(`Cumulative balance: ${colorize(formatBalance(result.cumulativeBalanceMinutes), result.cumulativeBalanceMinutes >= 0 ? 'green' : 'red')}`);
    return;
  }

  console.log('\nToday\'s sessions:');
  for (const session of result.sessions) {
    const endTime = session.end || colorize('now', 'cyan');
    console.log(`  ${session.start} - ${endTime}`);
  }

  console.log('');
  const statusText = result.isWorking ? colorize('Working', 'green') : colorize('Paused', 'yellow');
  console.log(`Status: ${statusText}`);
  console.log(`Worked: ${formatDuration(result.workedMinutes)}`);
  console.log(`Target: ${formatDuration(result.targetMinutes)}`);
  const todayColor = result.todayBalanceMinutes >= 0 ? 'green' : 'red';
  const cumulativeColor = result.cumulativeBalanceMinutes >= 0 ? 'green' : 'red';
  console.log(`Today's balance: ${colorize(formatBalance(result.todayBalanceMinutes), todayColor)}`);
  console.log(`Cumulative balance: ${colorize(formatBalance(result.cumulativeBalanceMinutes), cumulativeColor)}`);
}

function handleWeek(): void {
  const result = week();

  printUnclosedWarnings(result.unclosedSessions);

  console.log('\nThis week:');
  console.log('─'.repeat(45));

  let runningBalance = result.carryOverMinutes;
  const todayStr = new Date().toISOString().split('T')[0];

  for (const day of result.days) {
    const dayName = getDayName(day.date);
    const duration = day.minutes > 0 ? formatDuration(day.minutes) : colorize('-', 'dim');
    const marker = day.isToday ? colorize(' *', 'cyan') : '';

    let balanceStr = '';
    if (day.minutes > 0 || (day.date <= todayStr && day.targetMinutes > 0)) {
      runningBalance += day.balanceMinutes;
      const balColor = day.balanceMinutes >= 0 ? 'green' : 'red';
      const runColor = runningBalance >= 0 ? 'green' : 'red';
      balanceStr = ` ${colorize(formatBalance(day.balanceMinutes), balColor).padStart(18)} | ${colorize(formatBalance(runningBalance), runColor)}`;
    }

    console.log(`  ${dayName}: ${duration.padEnd(8)}${balanceStr}${marker}`);
  }

  console.log('─'.repeat(45));

  const todayEntry = result.days.find(d => d.isToday);
  if (todayEntry) {
    const balanceBeforeToday = runningBalance - todayEntry.balanceMinutes;
    const remainingToZero = todayEntry.targetMinutes - todayEntry.minutes - balanceBeforeToday;

    if (remainingToZero > 0) {
      console.log(`Remaining today: ${colorize(formatDuration(remainingToZero), 'yellow')} to reach 0 balance`);
    } else {
      console.log(`Today: ${colorize('Done!', 'green')} (${formatBalance(-remainingToZero)} extra)`);
    }
    console.log('─'.repeat(45));
  }

  const totalColor = runningBalance >= 0 ? 'green' : 'red';
  console.log(`Total balance: ${colorize(formatBalance(runningBalance), totalColor)}`);
  console.log('');
}

function handleHalf(): void {
  const result = half();
  if (result.error) {
    console.log(colorize(result.error, 'yellow'));
  } else {
    console.log(colorize(result.message!, 'green'));
  }
}

function handleFix(): void {
  const date = parseDate(timeArg);
  const endTime = parseTime(process.argv[4]);
  if (!endTime) {
    console.log(colorize('Missing end time argument. Use HH:MM (e.g., 17:30)', 'red'));
    process.exit(1);
  }

  const result = fix(date, endTime);
  if (result.error) {
    console.log(colorize(result.error, 'yellow'));
  } else {
    console.log(colorize(`Fixed ${date}`, 'green') + ` — closed at ${endTime}, worked ${formatDuration(result.workedMinutes!)}`);
  }
}

switch (command) {
  case 'start':
    handleStart();
    break;
  case 'pause':
    handlePause();
    break;
  case 'end':
    handleEnd();
    break;
  case 'status':
    handleStatus();
    break;
  case 'week':
    handleWeek();
    break;
  case 'half':
    handleHalf();
    break;
  case 'fix':
    handleFix();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    if (command) {
      console.log(`Unknown command: ${command}\n`);
    }
    showHelp();
}
