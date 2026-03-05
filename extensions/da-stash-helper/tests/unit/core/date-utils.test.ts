import {
  generateScheduleSlots,
  formatDisplayTime,
  todayISO,
  itemsPerDay,
  daysNeeded,
} from '../../../src/shared/date-utils';

describe('generateScheduleSlots', () => {
  it('returns the correct number of slots', () => {
    const slots = generateScheduleSlots(5, '2025-06-01', 9, 120, 9, 21);
    expect(slots).toHaveLength(5);
  });

  it('starts at the requested start hour', () => {
    const slots = generateScheduleSlots(1, '2025-06-01', 10, 60, 9, 21);
    expect(slots[0].hour).toBe(10);
  });

  it('clamps start hour to window start if before window', () => {
    const slots = generateScheduleSlots(1, '2025-06-01', 6, 60, 9, 21);
    expect(slots[0].hour).toBe(9);
  });

  it('moves to next day if start hour is at or past window end', () => {
    const slots = generateScheduleSlots(1, '2025-06-01', 21, 60, 9, 21);
    const date = slots[0].date;
    expect(date.getDate()).toBe(2); // June 2nd
    expect(slots[0].hour).toBe(9);
  });

  it('wraps to next day when slots exceed window end', () => {
    // Window 9-12, interval 120min: fits slots at 9 and 11, then wraps
    const slots = generateScheduleSlots(3, '2025-06-01', 9, 120, 9, 12);
    expect(slots[0].hour).toBe(9);
    expect(slots[1].hour).toBe(11);
    // Third slot should be next day at windowStart
    expect(slots[2].hour).toBe(9);
    expect(slots[2].date.getDate()).toBe(2);
  });

  it('returns slots with correct dateString format', () => {
    const slots = generateScheduleSlots(1, '2025-06-01', 9, 60, 9, 21);
    expect(slots[0].dateString).toBe('2025-06-01');
  });

  it('returns slots with displayTime', () => {
    const slots = generateScheduleSlots(1, '2025-06-01', 14, 60, 9, 21);
    expect(slots[0].displayTime).toBe('2 PM');
  });

  it('spaces slots correctly by interval', () => {
    const slots = generateScheduleSlots(3, '2025-06-01', 9, 180, 9, 21);
    expect(slots[0].hour).toBe(9);
    expect(slots[1].hour).toBe(12);
    expect(slots[2].hour).toBe(15);
  });
});

describe('formatDisplayTime', () => {
  it('formats midnight as 12 AM', () => {
    expect(formatDisplayTime(0)).toBe('12 AM');
  });

  it('formats morning hours correctly', () => {
    expect(formatDisplayTime(1)).toBe('1 AM');
    expect(formatDisplayTime(9)).toBe('9 AM');
    expect(formatDisplayTime(11)).toBe('11 AM');
  });

  it('formats noon as 12 PM', () => {
    expect(formatDisplayTime(12)).toBe('12 PM');
  });

  it('formats afternoon/evening hours correctly', () => {
    expect(formatDisplayTime(13)).toBe('1 PM');
    expect(formatDisplayTime(18)).toBe('6 PM');
    expect(formatDisplayTime(23)).toBe('11 PM');
  });
});

describe('todayISO', () => {
  it('returns a string matching YYYY-MM-DD format', () => {
    const result = todayISO();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns today\'s date', () => {
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    expect(todayISO()).toBe(expected);
  });
});

describe('itemsPerDay', () => {
  it('calculates items for a 12-hour window with 120-min interval', () => {
    // 9 to 21 = 12 hours = 720 min / 120 + 1 = 7
    expect(itemsPerDay(9, 21, 120)).toBe(7);
  });

  it('calculates items for a 6-hour window with 60-min interval', () => {
    // 9 to 15 = 6 hours = 360 min / 60 + 1 = 7
    expect(itemsPerDay(9, 15, 60)).toBe(7);
  });

  it('calculates items for a 3-hour window with 30-min interval', () => {
    // 10 to 13 = 3 hours = 180 min / 30 + 1 = 7
    expect(itemsPerDay(10, 13, 30)).toBe(7);
  });

  it('returns 1 when interval exceeds window', () => {
    // 9 to 10 = 1 hour = 60 min / 120 = 0, +1 = 1
    expect(itemsPerDay(9, 10, 120)).toBe(1);
  });
});

describe('daysNeeded', () => {
  it('calculates days needed for items fitting in one day', () => {
    // 7 items per day (9-21, 120min), need 5 items => 1 day
    expect(daysNeeded(5, 9, 21, 120)).toBe(1);
  });

  it('rounds up to fill partial days', () => {
    // 7 items per day, need 8 items => 2 days
    expect(daysNeeded(8, 9, 21, 120)).toBe(2);
  });

  it('returns 1 for a single item', () => {
    expect(daysNeeded(1, 9, 21, 120)).toBe(1);
  });

  it('handles exact multiple of items per day', () => {
    // 7 items per day, need exactly 14 => 2 days
    expect(daysNeeded(14, 9, 21, 120)).toBe(2);
  });
});
