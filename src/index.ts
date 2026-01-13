#!/usr/bin/env node

import { start, pause, end, status, week } from './lib/tracker.js';
import { formatDuration, formatBalance, getDayName, colorize } from './lib/display.js';

const command = process.argv[2];
const timeArg = process.argv[3];

function parseTime(arg: string | undefined): string | undefined {
  if (!arg) return undefined;

  // Validate HH:MM format
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

  // Normalize to HH:MM format
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function showHelp(): void {
  console.log(`
Time Tracking CLI

Usage: tt <command> [HH:MM]

Commands:
  start [HH:MM]   Start work or resume after break
  pause [HH:MM]   Pause for lunch/break
  end [HH:MM]     End work day
  status          Show today's progress and balance
  week            Show weekly summary with balance

Examples:
  tt start          # Start working now
  tt start 9:00     # Start working at 9:00 (forgot to log earlier)
  tt pause 12:30    # Log a pause at 12:30
  tt start 13:00    # Resume work at 13:00
  tt end 17:30      # End the day at 17:30
`);
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

  console.log('\nThis week:');
  console.log('─'.repeat(45));

  // Running balance starts with carry over
  let runningBalance = result.carryOverMinutes;
  const todayStr = new Date().toISOString().split('T')[0];

  for (const day of result.days) {
    const dayName = getDayName(day.date);
    const duration = day.minutes > 0 ? formatDuration(day.minutes) : colorize('-', 'dim');
    const marker = day.isToday ? colorize(' *', 'cyan') : '';

    // Show daily balance for days with data or past weekdays
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

  // Calculate remaining time to work today (considering all previous balance)
  const todayEntry = result.days.find(d => d.isToday);
  if (todayEntry) {
    const balanceBeforeToday = runningBalance - todayEntry.balanceMinutes;
    // How much do we need to work today to reach 0 balance?
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
