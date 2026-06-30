export declare function parseDuration(duration: string): number;
export declare function formatDuration(duration: string, fullUnit?: boolean): string;
export declare function convertDurationToFrequency(duration: string, denomination?: number): number;
export declare function getDurationNumberInItsUnit(duration: string): number;
export declare function getDurationUnitValue(duration: string): string;
export declare function validateDurationSchema(duration: string): string | undefined;
