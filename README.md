# Time Tracking CLI

A lightweight CLI tool to track your daily work time and balance against a 35-hour weekly target.

## Installation

```bash
pnpm install
pnpm run build
pnpm link -g
```

## Usage

```bash
tt start    # Start work or resume after a break
tt pause    # Pause for lunch/break
tt end      # End work day
tt status   # Show today's progress
tt week     # Show weekly summary with balance
```

## Example Workflow

```bash
$ tt start
Started at 09:00

$ tt pause
Paused at 12:30 (worked 3h 30m)

$ tt start
Started at 13:30

$ tt end
Ended at 17:30 (worked 7h 30m today)

$ tt week
This week:
────────────────────
  Mon: 7h 30m
  Tue: 8h
  Wed: 7h (today)
  Thu: -
  Fri: -
  Sat: -
  Sun: -
────────────────────
Total: 22h 30m / 35h
Balance: -12h 30m
```

## Data Storage

Time entries are stored in `~/.timetracking/data.json`.
