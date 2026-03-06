/**
 * Date utilities for the DA schedule picker.
 *
 * DA's schedule dialog uses a specific time format (12hr AM/PM).
 * This module handles date math for scheduling multiple items
 * with configurable intervals and time windows.
 */

export interface ScheduleSlot {
  date: Date;
  dateString: string;   // YYYY-MM-DD
  hour: number;         // 0-23
  displayTime: string;  // "9 AM", "2 PM"
}

/**
 * Generate a list of schedule slots for N items.
 *
 * @param itemCount - Number of items to schedule
 * @param startDate - ISO date string for first day
 * @param startHour - Starting hour (0-23)
 * @param intervalMinutes - Minutes between each publication
 * @param windowStart - Earliest hour in the day (e.g. 9)
 * @param windowEnd - Latest hour in the day (e.g. 21)
 */
export function generateScheduleSlots(
  itemCount: number,
  startDate: string,
  startHour: number,
  intervalMinutes: number,
  windowStart: number,
  windowEnd: number,
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  const current = new Date(startDate);
  current.setHours(startHour, 0, 0, 0);

  // Ensure startHour is within window
  if (startHour < windowStart) {
    current.setHours(windowStart);
  } else if (startHour >= windowEnd) {
    // Move to next day
    current.setDate(current.getDate() + 1);
    current.setHours(windowStart);
  }

  // Day-based intervals (>= 24 hours) skip the time window logic —
  // each item gets the same hour on successive days.
  const isDayInterval = intervalMinutes >= 1440;
  const dayStep = isDayInterval ? Math.round(intervalMinutes / 1440) : 0;

  for (let i = 0; i < itemCount; i++) {
    slots.push({
      date: new Date(current),
      dateString: formatDateISO(current),
      hour: current.getHours(),
      displayTime: formatDisplayTime(current.getHours()),
    });

    if (isDayInterval) {
      // Advance by whole days, keeping the same hour
      current.setDate(current.getDate() + dayStep);
    } else {
      // Advance by interval within the day
      current.setMinutes(current.getMinutes() + intervalMinutes);

      // If past the window end, move to next day's window start
      if (current.getHours() >= windowEnd || (current.getHours() === windowEnd && current.getMinutes() > 0)) {
        current.setDate(current.getDate() + 1);
        current.setHours(windowStart, 0, 0, 0);
      }
    }
  }

  return slots;
}

/**
 * Format an hour (0-23) into DA's schedule time format.
 * DA uses "12 AM", "1 AM", "2 AM", ..., "11 AM", "12 PM", "1 PM", etc.
 */
export function formatDisplayTime(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

/**
 * Parse DA's display time back to a 24-hour number.
 */
export function parseDisplayTime(displayTime: string): number {
  const match = displayTime.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (!match) return -1;

  let hour = parseInt(match[1], 10);
  const period = match[2].toUpperCase();

  if (period === 'AM') {
    if (hour === 12) hour = 0;
  } else {
    if (hour !== 12) hour += 12;
  }

  return hour;
}

/**
 * Format a date as YYYY-MM-DD.
 */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get today's date as YYYY-MM-DD.
 */
export function todayISO(): string {
  return formatDateISO(new Date());
}

/**
 * Parse a YYYY-MM-DD string to a Date object.
 */
export function parseDateISO(dateString: string): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Calculate how many items can be scheduled per day given a time window and interval.
 * For day-based intervals (>= 1440 min), returns 1 item per N days.
 */
export function itemsPerDay(windowStart: number, windowEnd: number, intervalMinutes: number): number {
  if (intervalMinutes >= 1440) {
    // Day-based: e.g. 1 day = 1/day, 2 days = 0.5/day, 1 week = ~0.14/day
    return 1;
  }
  const totalMinutes = (windowEnd - windowStart) * 60;
  return Math.floor(totalMinutes / intervalMinutes) + 1;
}

/**
 * Calculate how many days are needed to schedule N items.
 */
export function daysNeeded(
  itemCount: number,
  windowStart: number,
  windowEnd: number,
  intervalMinutes: number,
): number {
  if (intervalMinutes >= 1440) {
    const dayStep = Math.round(intervalMinutes / 1440);
    return itemCount * dayStep;
  }
  const perDay = itemsPerDay(windowStart, windowEnd, intervalMinutes);
  return Math.ceil(itemCount / perDay);
}
