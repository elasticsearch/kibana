import type { Group } from './types';
export declare const getEcsGroups: (groups?: Group[]) => Record<string, string | string[]>;
export declare const getEcsGroupsFromFlattenGrouping: (flattenGrouping?: Record<string, unknown>) => Record<string, string | string[]>;
