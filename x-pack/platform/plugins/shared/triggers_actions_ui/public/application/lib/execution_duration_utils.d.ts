import type { RuleType } from '../../types';
export declare function formatMillisForDisplay(value: number | undefined): string;
export declare function shouldShowDurationWarning(ruleType: RuleType | undefined, avgDurationMillis: number): boolean;
