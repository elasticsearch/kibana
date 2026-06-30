import type { MaybeRawData } from '../types';
/** Returns the raw data if it valid, or a default if it's not */
export declare const getRawDataOrDefault: (rawData: MaybeRawData) => Record<string, unknown[]>;
