/**
 * Gemini Image Detector
 *
 * Detects AI-generated images on Gemini pages and routes downloads through
 * the Opalite cloud sync pipeline via socket.ts's download interceptor.
 *
 * Runs in MAIN world so it can access the Zustand store (useOpaliteGlobal)
 * and send postMessages that socket.ts can receive.
 *
 * Why this exists:
 * - main.js v1.2.0's TQ() image scanner looks for #pageScroll + <a> tags
 *   with UUID-based hrefs, but Gemini now uses <INFINITE-SCROLLER> +
 *   <SINGLE-IMAGE> custom elements with non-UUID identifiers.
 * - Rather than patching 212K lines of minified code, this script
 *   independently detects images and feeds into the existing socket.ts
 *   download interceptor.
 */

declare global {
  interface Window {
    useOpaliteGlobal?: {
      getState: () => {
        isMember: boolean;
        isDownloaderConnected: boolean;
        userPlan: string;
      };
    };
  }
}

const PREFIX = '[Opalite GeminiImages]';

function log(...args: unknown[]): void {
  console.log(PREFIX, ...args);
}

function warn(...args: unknown[]): void {
  console.warn(PREFIX, ...args);
}

/** Convert lh3 thumbnail URL to full-resolution URL. */
function getFullSizeUrl(src: string): string {
  // lh3 URLs end with =sXXX or =sXXX-rj for resized versions
  // =s0 returns the original full-size image
  return src.replace(/=s\d+(-[a-z]+)?$/, '=s0');
}

/** Convert a Blob to a data URI string. */
function blobToDataUri(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert an already-loaded <img> to a data URI via canvas.
 * Only works if the image was loaded with appropriate CORS headers
 * or from the same origin — otherwise the canvas is tainted.
 */
function imageToDataUri(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    // Canvas tainted by cross-origin image
    return null;
  }
}

/**
 * Get image data as a data URI using multiple strategies:
 *
 * 1. fetch() from MAIN world with credentials — sends Google cookies
 *    from the gemini.google.com page context to lh3.googleusercontent.com
 * 2. Image element with crossOrigin='use-credentials' — same cookie approach
 * 3. Canvas of the already-displayed image — fails if cross-origin tainted
 * 4. Raw URL fallback — socket.ts will try its own fetch pipeline
 */
async function getImageDataUri(
  displayedImg: HTMLImageElement,
  fullUrl: string,
): Promise<string> {
  // Strategy 1: fetch with credentials from page context
  try {
    const resp = await fetch(fullUrl, { credentials: 'include' });
    if (resp.ok) {
      const blob = await resp.blob();
      const dataUri = await blobToDataUri(blob);
      if (dataUri) {
        log('Got image via fetch with credentials');
        return dataUri;
      }
    }
  } catch {
    log('Fetch with credentials failed, trying Image element...');
  }

  // Strategy 2: Load via Image element with use-credentials
  const imgResult = await new Promise<string | null>((resolve) => {
    const fullImg = new Image();
    fullImg.crossOrigin = 'use-credentials';
    fullImg.onload = () => resolve(imageToDataUri(fullImg));
    fullImg.onerror = () => resolve(null);
    fullImg.src = fullUrl;
  });
  if (imgResult) {
    log('Got image via Image element with credentials');
    return imgResult;
  }

  // Strategy 3: Canvas of the displayed image (likely tainted, but try)
  const canvasResult = imageToDataUri(displayedImg);
  if (canvasResult) {
    log('Got image via canvas of displayed image');
    return canvasResult;
  }

  // Strategy 4: Raw URL fallback
  warn('All data URI strategies failed, sending raw URL');
  return fullUrl;
}

/** Extract the user's prompt from the conversation context. */
function getPrompt(imageElement: Element): string {
  const conv = imageElement.closest('.conversation-container');
  if (!conv) return '';
  const userMsg = conv.querySelector('.user-query-content');
  let text = userMsg?.textContent?.trim() || '';
  // Remove "You said" prefix that Gemini adds
  text = text.replace(/^You said\s+/i, '');
  return text;
}

/** Generate a descriptive filename from the prompt. */
function generateFilename(prompt: string, index: number): string {
  const sanitized = prompt
    .substring(0, 50)
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const suffix = sanitized || 'generated';
  return `Gemini_${suffix}_${index}.png`;
}

/** Send a downloadImage postMessage for socket.ts to intercept. */
function sendCloudDownload(
  url: string,
  filename: string,
  prompt: string,
): void {
  window.postMessage(
    {
      source: 'Opalite',
      type: 'downloadImage',
      payload: { url, filename, prompt },
    },
    '*',
  );
}

/** Check if cloud sync is available (user is authenticated member with socket connected). */
function isCloudSyncReady(): boolean {
  const state = window.useOpaliteGlobal?.getState?.();
  return !!(state?.isMember && state?.isDownloaderConnected);
}

/**
 * Process a detected SINGLE-IMAGE element: extract URL, prompt, and
 * optionally auto-download + hook the download button.
 */
function processImage(
  singleImage: Element,
  processedSrcs: Set<string>,
  autoDownload: boolean,
): void {
  const img = singleImage.querySelector('img.image, img.loaded, img');
  if (!img || !(img instanceof HTMLImageElement)) return;

  const src = img.src;
  if (!src || processedSrcs.has(src)) return;

  // Only process Gemini-hosted images
  if (!src.includes('lh3.googleusercontent.com')) return;

  processedSrcs.add(src);

  const index = parseInt(
    singleImage.getAttribute('data-image-attachment-index') || '0',
    10,
  );
  const fullUrl = getFullSizeUrl(src);
  const prompt = getPrompt(singleImage);
  const filename = generateFilename(prompt, index);

  log('Detected image:', {
    index,
    prompt: prompt.substring(0, 60),
    url: fullUrl.substring(0, 80),
  });

  // Auto-download to cloud if enabled
  if (autoDownload && isCloudSyncReady()) {
    log('Auto-downloading to cloud:', filename);
    getImageDataUri(img, fullUrl).then((dataUri) => {
      sendCloudDownload(dataUri, filename, prompt);
    });
  }

  // Hook the download button to also route through cloud sync
  interceptDownloadButton(singleImage, img, fullUrl, filename, prompt);
}

/**
 * Add a click listener to Gemini's download button so that clicking it
 * ALSO sends the image through cloud sync (in addition to local download).
 */
function interceptDownloadButton(
  container: Element,
  img: HTMLImageElement,
  fullUrl: string,
  filename: string,
  prompt: string,
): void {
  const parent = container.closest('generated-image') || container.parentElement;
  if (!parent) return;

  // Gemini's download button uses data-test-id
  const dlBtn = parent.querySelector(
    'button[data-test-id="download-generated-image-button"]',
  );
  if (!dlBtn || (dlBtn as HTMLElement).dataset.opaliteHooked) return;

  (dlBtn as HTMLElement).dataset.opaliteHooked = 'true';

  dlBtn.addEventListener(
    'click',
    () => {
      if (isCloudSyncReady()) {
        log('Download button clicked - also sending to cloud:', filename);
        getImageDataUri(img, fullUrl).then((dataUri) => {
          sendCloudDownload(dataUri, filename, prompt);
        });
      }
    },
    { capture: true },
  );
}

/**
 * Main setup function. Call from a MAIN world content script.
 */
export function setupGeminiImageDetector(): void {
  const processedSrcs = new Set<string>();

  // Watch for new images being added to the DOM
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        // Check if this node is or contains a SINGLE-IMAGE element
        const candidates: Element[] = [];
        if (node.matches?.('single-image')) {
          candidates.push(node);
        } else {
          candidates.push(...Array.from(node.querySelectorAll('single-image')));
        }

        for (const candidate of candidates) {
          // Delay to let the img src be set by Gemini's rendering
          setTimeout(() => processImage(candidate, processedSrcs, true), 1000);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also scan existing images (page may already have generated images)
  setTimeout(() => {
    const existing = document.querySelectorAll('single-image');
    if (existing.length > 0) {
      log('Found', existing.length, 'existing image(s)');
      existing.forEach((img) =>
        processImage(img, processedSrcs, false),
      );
    }
  }, 2000);

  log('Gemini image detector ready');
}
