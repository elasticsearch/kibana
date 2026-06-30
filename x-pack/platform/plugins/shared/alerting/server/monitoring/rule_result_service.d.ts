import type { PublicLastRunSetters } from '../types';
export interface RuleResultServiceResults {
    errors: LastRunError[];
    warnings: string[];
    outcomeMessage: string;
}
interface LastRunError {
    message: string;
    userError: boolean;
}
export declare class RuleResultService {
    private errors;
    private warnings;
    private outcomeMessage;
    getLastRunErrors(): LastRunError[];
    getLastRunWarnings(): string[];
    getLastRunOutcomeMessage(): string;
    getLastRunResults(): RuleResultServiceResults;
    getLastRunSetters(): PublicLastRunSetters;
    private addLastRunError;
    private addLastRunWarning;
    private setLastRunOutcomeMessage;
}
export {};
