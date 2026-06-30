import type { EuiThemeComputed } from '@elastic/eui';
import type { SerializableRecord } from '@kbn/utility-types';
export interface ColorRampStop extends SerializableRecord {
    stop: number;
    color: string;
}
/**
 * Returns a theme-aware color ramp for ML severity scores.
 * @param euiTheme The EUI theme object.
 * @returns An array of ColorRampStop objects.
 */
export declare const getMlSeverityColorRampValue: (euiTheme: EuiThemeComputed) => ColorRampStop[];
