import type { SnoozeSchedule } from '../../../../../../types';
import type { SnoozeUnit } from './constants';
export declare const usePreviousSnoozeInterval: (p?: string | null) => [string | null, (n: string) => void];
export declare const futureTimeToInterval: (time?: Date | null) => string | undefined;
export declare const durationToTextString: (value: number, unit: SnoozeUnit) => string;
export declare const scheduleSummary: (schedule: SnoozeSchedule) => string;
