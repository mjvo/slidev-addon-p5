/**
 * p5.js Version Manager
 *
 * Manages p5.js library versions and CDN URLs
 * Supports multiple versions with validation and fallback to latest stable
 */

/**
 * Supported p5.js versions with their CDN URLs
 * Sorted by release date (newest first)
 */
const SUPPORTED_VERSIONS: Record<string, string> = {
  '2.2.0': 'https://cdn.jsdelivr.net/npm/p5@2.2.0/lib/p5.min.js',
  '2.1.0': 'https://cdn.jsdelivr.net/npm/p5@2.1.0/lib/p5.min.js',
  '2.0.0': 'https://cdn.jsdelivr.net/npm/p5@2.0.0/lib/p5.min.js',
  '1.7.0': 'https://cdn.jsdelivr.net/npm/p5@1.7.0/lib/p5.min.js',
  '1.6.0': 'https://cdn.jsdelivr.net/npm/p5@1.6.0/lib/p5.min.js',
};

/**
 * Latest stable version of p5.js
 * Update this when a new version is released and tested
 */
export const LATEST_P5_VERSION = '2.2.0';

/**
 * Get the CDN URL for a specific p5.js version
 *
 * @param version - The desired p5.js version (e.g., '2.2.0')
 * @returns The CDN URL for the version, or latest if version not found
 *
 * @example
 * const url = getP5CDNUrl('2.1.0');
 * // Returns: https://cdn.jsdelivr.net/npm/p5@2.1.0/lib/p5.min.js
 *
 * const url = getP5CDNUrl('99.0.0');
 * // Returns: https://cdn.jsdelivr.net/npm/p5@2.2.0/lib/p5.min.js (latest)
 */
export const getP5CDNUrl = (version?: string): string => {
  if (!version) {
    return SUPPORTED_VERSIONS[LATEST_P5_VERSION];
  }

  // Exact match found
  if (version in SUPPORTED_VERSIONS) {
    return SUPPORTED_VERSIONS[version];
  }

  // Normalize version (remove 'v' prefix if present)
  const normalized = version.replace(/^v/, '');
  if (normalized in SUPPORTED_VERSIONS) {
    return SUPPORTED_VERSIONS[normalized];
  }

  // Version not found, log warning and return latest
  console.warn(
    `p5.js version ${version} not in supported list. Using latest (${LATEST_P5_VERSION}).`,
    `Supported versions: ${Object.keys(SUPPORTED_VERSIONS).join(', ')}`
  );
  return SUPPORTED_VERSIONS[LATEST_P5_VERSION];
};

/**
 * Check if a version is supported
 *
 * @param version - The version to check
 * @returns True if version is supported, false otherwise
 *
 * @example
 * isVersionSupported('2.2.0');  // true
 * isVersionSupported('99.0.0'); // false
 */
export const isVersionSupported = (version: string): boolean => {
  return version in SUPPORTED_VERSIONS || version.replace(/^v/, '') in SUPPORTED_VERSIONS;
};

/**
 * Get list of supported versions
 *
 * @returns Array of supported version strings, sorted newest first
 *
 * @example
 * getSupportedVersions();
 * // Returns: ['2.2.0', '2.1.0', '2.0.0', '1.7.0', '1.6.0']
 */
export const getSupportedVersions = (): string[] => {
  return Object.keys(SUPPORTED_VERSIONS);
};

/**
 * Validate and normalize a version string
 *
 * @param version - The version to validate
 * @returns Normalized version string, or undefined if invalid
 *
 * @example
 * validateVersion('2.2.0');   // '2.2.0'
 * validateVersion('v2.2.0');  // '2.2.0'
 * validateVersion('2.2');     // undefined (incomplete version)
 */
export const validateVersion = (version?: string): string | undefined => {
  if (!version) {
    return undefined;
  }

  const normalized = version.replace(/^v/, '').trim();

  // Check if exact match
  if (normalized in SUPPORTED_VERSIONS) {
    return normalized;
  }

  // Log warning but don't fail - let getP5CDNUrl handle fallback
  if (!isVersionSupported(normalized)) {
    console.warn(
      `p5.js version "${normalized}" is not in the supported list. It will be replaced with latest (${LATEST_P5_VERSION}).`
    );
  }

  return normalized;
};

/**
 * Configuration for p5.js loading
 */
export interface P5VersionConfig {
  version?: string; // Specific version to load (e.g., '2.2.0')
  cdnUrl?: string;  // Override with custom CDN URL (for self-hosted)
}

/**
 * Get the final CDN URL with validation
 *
 * @param config - Version configuration
 * @returns The CDN URL to use for loading p5.js
 *
 * @example
 * getP5LoadUrl({ version: '2.1.0' });
 * // Returns: https://cdn.jsdelivr.net/npm/p5@2.1.0/lib/p5.min.js
 *
 * getP5LoadUrl({ cdnUrl: 'https://example.com/p5.min.js' });
 * // Returns: https://example.com/p5.min.js
 */
export const getP5LoadUrl = (config?: P5VersionConfig): string => {
  // Custom CDN URL takes priority
  if (config?.cdnUrl) {
    return config.cdnUrl;
  }

  // Use version if specified
  if (config?.version) {
    return getP5CDNUrl(config.version);
  }

  // Default to latest
  return getP5CDNUrl();
};
