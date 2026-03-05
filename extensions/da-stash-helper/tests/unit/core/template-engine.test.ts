import { applyTemplate, validateTemplate } from '../../../src/shared/template-engine';

describe('applyTemplate', () => {
  it('replaces {filename}', () => {
    expect(applyTemplate('{filename}', { filename: 'sunset_photo' })).toBe('sunset_photo');
  });

  it('replaces {n} with sequential number', () => {
    expect(applyTemplate('Item {n}', { n: 5 })).toBe('Item 5');
  });

  it('replaces {n:3} with zero-padded number', () => {
    expect(applyTemplate('Pic_{n:3}', { n: 7 })).toBe('Pic_007');
  });

  it('replaces {n:5} with wider padding', () => {
    expect(applyTemplate('{n:5}', { n: 42 })).toBe('00042');
  });

  it('replaces {total}', () => {
    expect(applyTemplate('{n} of {total}', { n: 3, total: 10 })).toBe('3 of 10');
  });

  it('replaces {title}', () => {
    expect(applyTemplate('Edit: {title}', { title: 'My Art' })).toBe('Edit: My Art');
  });

  it('{date} produces YYYY-MM-DD format', () => {
    const result = applyTemplate('{date}', {});
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('{date:short} produces abbreviated month format', () => {
    const result = applyTemplate('{date:short}', {});
    // Matches patterns like "Jan 1", "Feb 28", "Dec 31"
    expect(result).toMatch(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{1,2}$/);
  });

  it('{time} produces HH:MM format', () => {
    const result = applyTemplate('{time}', {});
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('leaves unknown variables as-is', () => {
    expect(applyTemplate('Hello {unknown}', {})).toBe('Hello {unknown}');
  });

  it('returns empty string for empty template', () => {
    expect(applyTemplate('', { n: 1 })).toBe('');
  });

  it('replaces multiple variables in one string', () => {
    const result = applyTemplate('{filename} - {n} of {total}', {
      filename: 'photo',
      n: 2,
      total: 50,
    });
    expect(result).toBe('photo - 2 of 50');
  });

  it('handles custom context variables', () => {
    expect(applyTemplate('{artist} - {series}', { artist: 'Claude', series: 'Landscapes' }))
      .toBe('Claude - Landscapes');
  });

  it('leaves {n} as-is when context.n is undefined', () => {
    expect(applyTemplate('{n}', {})).toBe('{n}');
  });
});

describe('validateTemplate', () => {
  it('extracts variable names from template', () => {
    const result = validateTemplate('{filename} - {n} of {total}');
    expect(result.valid).toBe(true);
    expect(result.variables).toEqual(['filename', 'n', 'total']);
  });

  it('handles variables with modifiers', () => {
    const result = validateTemplate('{n:3} - {date:short}');
    expect(result.valid).toBe(true);
    expect(result.variables).toEqual(['n', 'date']);
  });

  it('returns empty variables for plain text', () => {
    const result = validateTemplate('no variables here');
    expect(result.valid).toBe(true);
    expect(result.variables).toEqual([]);
  });

  it('returns empty variables for empty template', () => {
    const result = validateTemplate('');
    expect(result.valid).toBe(true);
    expect(result.variables).toEqual([]);
  });

  it('extracts single variable', () => {
    const result = validateTemplate('{title}');
    expect(result.variables).toEqual(['title']);
  });
});
