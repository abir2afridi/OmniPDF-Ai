import { useCallback } from 'react';
import { getCurrentOrigin, shouldStayInCurrentEnvironment, navigateSafely, isDevelopment, isProduction } from '../lib/config';

/**
 * Custom hook for environment-aware navigation.
 * Prevents accidental redirects to production during development.
 *
 * The hook relies on `window.location.origin` (via lib/config) as the single
 * source of truth, so redirects always stay on the current host.
 */
export const useEnvironmentNavigation = () => {

  /** Navigate within the current origin. */
  const navigate = useCallback((path: string) => {
    return navigateSafely(path);
  }, []);

  /**
   * Open a link — if it targets a different origin, it opens in a new tab.
   * Same-origin links navigate in-place.
   */
  const openExternalLink = useCallback((url: string) => {
    if (!shouldStayInCurrentEnvironment(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      navigate(url);
    }
  }, [navigate]);

  /** Get the current base URL (origin). */
  const getBaseUrl = useCallback(() => {
    return getCurrentOrigin();
  }, []);

  return {
    navigate,
    openExternalLink,
    isDevelopment: () => isDevelopment,
    isProduction: () => isProduction,
    getBaseUrl,
  };
};
