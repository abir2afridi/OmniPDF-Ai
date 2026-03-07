/**
 * Environment-based configuration utility
 * Ensures all URLs and navigation stay within the current environment
 * 
 * STRATEGY:
 *   1. Use `window.location.origin` as the single source of truth for the base URL.
 *      This guarantees that whether the app is running at http://localhost:3000
 *      or https://omni2pdf-ai.vercel.app, all derived URLs remain on the same host.
 *   2. VITE_APP_ENV is optional — if missing we auto-detect from the hostname.
 *   3. VITE_API_URL / VITE_APP_URL from env files are still honoured when present,
 *      but they are NEVER used as fallbacks that could pull localhost traffic to prod.
 */

// ---------------------------------------------------------------------------
// Environment detection (reliable, automatic)
// ---------------------------------------------------------------------------

/** True when running on localhost / 127.0.0.1 (any port). */
export const isDevelopment: boolean = (() => {
  // 1. Explicit env variable takes priority
  if (import.meta.env.VITE_APP_ENV === 'development') return true;
  if (import.meta.env.VITE_APP_ENV === 'production') return false;

  // 2. Auto-detect from browser URL
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }

  // 3. Node / SSR fallback — assume development for safety
  return true;
})();

export const isProduction: boolean = !isDevelopment;

// ---------------------------------------------------------------------------
// Origin helpers
// ---------------------------------------------------------------------------

export const DEFAULT_APP_URL = import.meta.env.VITE_APP_URL || 'https://omni2pdf-ai.vercel.app';

export const BASE_URL = typeof window !== 'undefined'
  ? window.location.origin
  : DEFAULT_APP_URL;

export const getCurrentOrigin = (): string => {
  return BASE_URL;
};

// ---------------------------------------------------------------------------
// Environment-specific config
// ---------------------------------------------------------------------------

export const config = {
  development: {
    apiUrl: import.meta.env.VITE_API_URL || BASE_URL,
    supabaseUrl: 'https://rsagndlatqwzzsjqbqqt.supabase.co',
    appUrl: import.meta.env.VITE_APP_URL || BASE_URL,
  },
  production: {
    apiUrl: import.meta.env.VITE_API_URL || BASE_URL,
    supabaseUrl: 'https://rsagndlatqwzzsjqbqqt.supabase.co',
    appUrl: import.meta.env.VITE_APP_URL || BASE_URL,
  },
};

/** Config for the current environment. */
export const currentConfig = isDevelopment ? config.development : config.production;

// ---------------------------------------------------------------------------
// URL builders & navigation helpers
// ---------------------------------------------------------------------------

/** Build a full URL for the current environment (always same origin). */
export const getEnvUrl = (path: string = ''): string => {
  return `${getCurrentOrigin()}${path}`;
};

/** True when `url` points to the same origin the app is running on. */
export const shouldStayInCurrentEnvironment = (url: string): boolean => {
  const currentOrigin = getCurrentOrigin();
  try {
    const urlObj = new URL(url, currentOrigin);
    return urlObj.origin === currentOrigin;
  } catch {
    // Relative URLs are always same-origin
    return true;
  }
};

/**
 * Navigate to `path` within the current host.
 * Prevents any accidental cross-origin jump (e.g. localhost → prod).
 */
export const navigateSafely = (path: string): string => {
  const currentOrigin = getCurrentOrigin();
  const fullUrl = `${currentOrigin}${path}`;

  if (import.meta.env.VITE_DEBUG_MODE === 'true') {
    console.log('🔄 Safe Navigation to:', fullUrl);
    console.log('🌍 Environment:', isDevelopment ? 'Development' : 'Production');
  }

  if (typeof window !== 'undefined') {
    window.location.href = fullUrl;
  }

  return fullUrl;
};

/**
 * Get the OAuth redirect URL for Supabase auth.
 * Always points back to the same origin the user is currently on.
 */
export const getAuthRedirectUrl = (): string => {
  return `${BASE_URL}`;
};
