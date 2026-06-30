import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
export declare const LEGACY_TERMS: string[];
export declare function trackLegacyTerminology(terms: Array<string | string[]>, usageCounter?: UsageCounter): null | undefined;
