/**
 * Theme Detector — detects DeviantArt's current dark/light theme.
 *
 * DA stores its theme mode as a `data-theme` attribute on the `<html>` element.
 * Falls back to luminance check on the body background color.
 */

/**
 * Detect the current DA theme from the page.
 */
export function detectDATheme(): 'dark' | 'light' {
  // Primary: check data-theme attribute on <html>
  const htmlTheme = document.documentElement.getAttribute('data-theme');
  if (htmlTheme === 'light') return 'light';
  if (htmlTheme === 'dark') return 'dark';

  // Secondary: check a data-* attribute on <body>
  const bodyTheme = document.body?.getAttribute('data-theme');
  if (bodyTheme === 'light') return 'light';
  if (bodyTheme === 'dark') return 'dark';

  // Fallback: luminance check on body background color
  const bgColor = window.getComputedStyle(document.body).backgroundColor;
  if (bgColor) {
    const luminance = getLuminance(bgColor);
    if (luminance !== null) {
      return luminance < 0.5 ? 'dark' : 'light';
    }
  }

  // Default to dark (DA's default)
  return 'dark';
}

/**
 * Observe DA theme changes via MutationObserver on <html> attributes.
 * Returns a cleanup function to disconnect the observer.
 */
export function observeDAThemeChanges(callback: (theme: 'dark' | 'light') => void): () => void {
  let lastTheme = detectDATheme();

  const observer = new MutationObserver(() => {
    const newTheme = detectDATheme();
    if (newTheme !== lastTheme) {
      lastTheme = newTheme;
      callback(newTheme);
    }
  });

  // Watch both <html> and <body> for attribute changes
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  });

  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
  }

  return () => observer.disconnect();
}

/**
 * Parse an rgb/rgba CSS color string and return its relative luminance (0–1).
 * Returns null if parsing fails.
 */
function getLuminance(color: string): number | null {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;

  const r = parseInt(match[1], 10) / 255;
  const g = parseInt(match[2], 10) / 255;
  const b = parseInt(match[3], 10) / 255;

  // Relative luminance per WCAG 2.0
  const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}
