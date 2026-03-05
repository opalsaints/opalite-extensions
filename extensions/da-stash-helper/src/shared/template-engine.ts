/**
 * Template engine for bulk edit operations.
 *
 * Supports variables like {filename}, {n}, {title}, {date}, {time}.
 * Used by the Edit strategy to generate titles/descriptions.
 */

export interface TemplateContext {
  /** Original filename (without extension) */
  filename?: string;
  /** Sequential number (1-based) */
  n?: number;
  /** Total item count */
  total?: number;
  /** Original title */
  title?: string;
  /** Current date in various formats */
  date?: string;
  /** Current time */
  time?: string;
  /** Custom variables */
  [key: string]: string | number | undefined;
}

/**
 * Replace template variables in a string.
 *
 * Supported patterns:
 *   {filename}  — Original filename (no extension)
 *   {n}         — Sequential number (1-based)
 *   {n:3}       — Zero-padded number (e.g., 001)
 *   {total}     — Total item count
 *   {title}     — Original title
 *   {date}      — Current date (YYYY-MM-DD)
 *   {date:short} — Short date (Jan 15)
 *   {time}      — Current time (HH:MM)
 *   {custom}    — Any custom variable from context
 */
export function applyTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{(\w+)(?::(\w+))?\}/g, (match, key: string, modifier: string) => {
    if (key === 'n' && context.n !== undefined) {
      if (modifier) {
        const padLength = parseInt(modifier, 10);
        if (!isNaN(padLength)) {
          return String(context.n).padStart(padLength, '0');
        }
      }
      return String(context.n);
    }

    if (key === 'date') {
      const now = new Date();
      if (modifier === 'short') {
        return formatShortDate(now);
      }
      return formatISODate(now);
    }

    if (key === 'time') {
      return formatTime(new Date());
    }

    const value = context[key];
    if (value !== undefined) {
      return String(value);
    }

    // Leave unrecognized variables as-is
    return match;
  });
}

/**
 * Validate a template string — check for well-formed variables.
 */
export function validateTemplate(template: string): { valid: boolean; variables: string[] } {
  const variables: string[] = [];
  const regex = /\{(\w+)(?::(\w+))?\}/g;
  let result = regex.test(template); // just validates format

  // Reset and collect variable names
  const varRegex = /\{(\w+)(?::(\w+))?\}/g;
  let m: RegExpMatchArray | null;
  // Use string.match approach to avoid exec
  const allMatches = template.match(/\{(\w+)(?::(\w+))?\}/g) ?? [];
  for (const matchStr of allMatches) {
    const inner = matchStr.slice(1, -1); // remove { }
    const parts = inner.split(':');
    variables.push(parts[0]);
  }

  return { valid: true, variables };
}

// ── Date Formatting ──

function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShortDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}
