import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
export interface CountUsageOfPredefinedIdsOptions {
    predefinedId?: string;
    spaceId?: string;
    usageCounter?: UsageCounter;
}
export declare function countUsageOfPredefinedIds({ predefinedId, spaceId, usageCounter, }: CountUsageOfPredefinedIdsOptions): void;
