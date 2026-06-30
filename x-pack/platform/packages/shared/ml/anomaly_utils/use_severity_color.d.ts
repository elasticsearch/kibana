import type { EuiThemeComputed } from '@elastic/eui';
/**
 * Resolves severity color based on normalized score and EUI theme colors.
 * This function can be used in contexts where the EuiTheme object is available,
 * for example, within class components that receive the theme via props or context.
 *
 * @param normalizedScore The anomaly score, normalized (typically 0-100).
 * @param euiTheme The EuiTheme object.
 * @returns The hex color string for the severity.
 */
export declare function getThemeResolvedSeverityColor(normalizedScore: number, euiTheme: EuiThemeComputed): string;
export declare function getThemeResolvedSeverityStrokeColor(normalizedScore: number, euiTheme: EuiThemeComputed): string;
/**
 * A React hook to get a theme-aware severity color string directly.
 * This hook computes the color based on the normalized score and the current EUI theme.
 *
 * @param normalizedScore The anomaly score, normalized (typically 0-100).
 * @returns The hex color string for the severity, corresponding to the current theme.
 */
export declare const useSeverityColor: (normalizedScore: number) => string;
