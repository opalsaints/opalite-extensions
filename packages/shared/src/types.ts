/**
 * Shared types for Opalite extensions.
 *
 * Every new extension only needs to provide a PlatformConfig object —
 * all shared modules (auth, socket, background, popup, etc.) are
 * parameterized by this single interface.
 */

// ─── Platform Configuration ──────────────────────────────────────────

export interface PlatformConfig {
  /** Unique platform identifier sent to the server (e.g., 'chatgpt', 'gemini', 'grok') */
  extensionType: string;

  /** Human-readable platform name shown in the popup UI (e.g., 'ChatGPT') */
  platformName: string;

  /** URL to the platform's main page (e.g., 'https://chatgpt.com/') */
  platformUrl: string;

  /** Hostnames used to detect if the user is on this platform's site */
  platformHosts: string[];

  /**
   * Internal app name used as the postMessage source between content.js
   * and main.js (e.g., 'AutoGPT', 'AutoGemini', 'AutoGrok').
   */
  appName: string;

  /** XOR key used for content.js string encoding (e.g., 'gpt', 'gem', 'grk') */
  xorKey: string;

  /** Opalite server base URL */
  server: string;

  /** Extension display name shown in the popup header (e.g., 'ChatGPT Suite') */
  extensionName: string;

  /**
   * Domain suffixes allowed for background-worker fetch.
   * e.g., ['chatgpt.com', 'openai.com', 'oaidalleapiprodscus.blob.core.windows.net']
   */
  allowedFetchDomains: string[];

  /** Popup branding */
  branding: PlatformBranding;

  /** Socket sync metadata sent on connect */
  syncInfo: {
    /** Display name (e.g., 'Opalite for ChatGPT') */
    name: string;
    /** Website hostname (e.g., 'chatgpt.com') */
    website: string;
  };

  /**
   * Optional custom DOM event name fired by compat.js when an image
   * is created (e.g., 'chatgpt-imagine-created'). Listened to by the
   * download interceptor for debug logging.
   */
  customDownloadEvent?: string;
}

export interface PlatformBranding {
  /** CSS gradient for the logo, avatar ring, and primary button */
  gradient: string;
  /** Short label shown in the popup header badge (e.g., 'ChatGPT') */
  badgeText: string;
}

// ─── Auth / Storage Bridge Types ─────────────────────────────────────

export interface OpaliteUser {
  id?: string;
  name?: string;
  email?: string;
  image?: string;
  avatar?: string;
}

export interface OpaliteAuthAPI {
  server: string;
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<unknown>;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<unknown>;
  getUser(): Promise<OpaliteUser | null>;
  setUser(user: OpaliteUser): Promise<unknown>;
  clearAuth(): Promise<unknown>;
  signOut(): Promise<unknown>;
  exchangeCode(code: string, extensionType: string): Promise<AuthExchangeResult>;
  refreshAuth(): Promise<boolean>;
  getValidToken(): Promise<string | null>;
  isAuthenticated(): Promise<boolean>;
  /** Extension base URL set by content-loader for resource resolution */
  _extensionUrl?: string;
}

export interface AuthExchangeResult {
  jwt: string;
  user: OpaliteUser;
  refreshToken?: string;
}

// ─── Socket Types ────────────────────────────────────────────────────

export interface OpaliteSocketAPI {
  getSocket(): unknown;
  isConnected(): boolean;
  isLimitReached(): boolean;
  reconnect(): void;
  disconnect(): void;
}

export interface DownloadPayload {
  url: string;
  filename: string;
  metadata: {
    source: string;
    prompt: string;
    platform: string;
    originalSource?: string;
  };
}

export interface BulkDownloadPayload {
  items: DownloadPayload[];
  source: string;
}

export interface PlanStatusData {
  plan: string;
  isMember?: boolean;
  limits?: PlanLimits | null;
  usage?: PlanUsage | null;
  credits?: PlanCredits | null;
  storageUsedBytes?: number;
  storageQuotaBytes?: number;
}

export interface PlanLimits {
  downloadsPerMonth?: number;
  creditsPerMonth?: number;
  [key: string]: unknown;
}

export interface PlanUsage {
  download?: number;
  [key: string]: unknown;
}

export interface PlanCredits {
  used?: number;
  balance?: number;
  [key: string]: unknown;
}

// ─── Background Types ────────────────────────────────────────────────

export interface BackgroundConfig {
  /** Extension type for session sync (e.g., 'chatgpt') */
  extensionType: string;
  /** Opalite server URL */
  server: string;
  /** Domain suffixes allowed for fetchAsDataUri */
  allowedFetchDomains: string[];
  /** Source identifier for message filtering (lowercase) */
  sourceId: string;
}

// ─── Callback Types ──────────────────────────────────────────────────

export interface CallbackConfig {
  /** Extension type identifier */
  extensionType: string;
  /** Target site URL for the "go to site" link */
  siteUrl: string;
  /** Display name for the site link */
  siteName: string;
  /** Opalite server URL */
  server: string;
}

// ─── Content Loader Types ────────────────────────────────────────────

export interface ContentLoaderConfig {
  /** App name used as postMessage source (e.g., 'AutoGPT') */
  appName: string;
  /** XOR key for the encoded string */
  xorKey: string;
  /**
   * Source identifier used by main.js for message passing (e.g., 'opalite').
   * The bridge accepts messages from both `appName` and `sourceId`.
   * Must match the sourceId used in the background config.
   */
  sourceId: string;
  /**
   * Whether this platform should skip injection (e.g., certain sub-pages).
   * Return true to abort content script loading.
   */
  shouldSkip?: () => boolean;
}

// ─── Popup Types ─────────────────────────────────────────────────────

export interface PopupConfig {
  /** Opalite server URL */
  server: string;
  /** Hostnames for platform detection */
  platformHosts: string[];
  /** Human-readable platform name */
  platformName: string;
  /** URL to open the platform */
  platformUrl: string;
  /** Extension type identifier */
  extensionType: string;
  /** Branding for colors and labels */
  branding: PlatformBranding;
  /** Extension display name for the header */
  extensionName: string;
}

// ─── Global Window Augmentation ──────────────────────────────────────

declare global {
  interface Window {
    __opalite?: OpaliteAuthAPI;
    __opaliteSocket?: OpaliteSocketAPI;
    useOpaliteGlobal?: {
      setState(state: Record<string, unknown>): void;
      getState(): Record<string, unknown>;
    };
    define?: unknown;
    io?: unknown;
  }
}
