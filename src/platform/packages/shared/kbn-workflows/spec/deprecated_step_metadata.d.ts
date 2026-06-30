export interface StepDeprecationInfo {
    replacementStepType?: string;
    message?: string;
}
export interface StepPrefixDeprecationInfo {
    /** Prefix to match against step type (e.g., 'inference.' matches 'inference.completion') */
    prefix: string;
    deprecation: StepDeprecationInfo;
}
export declare const DEPRECATED_STEP_METADATA: Record<string, StepDeprecationInfo>;
/**
 * Prefix-based deprecation for step types. Any step type starting with one of these
 * prefixes is treated as deprecated. This avoids enumerating every sub-action when an
 * entire connector family is superseded by a purpose-built step.
 */
export declare const DEPRECATED_STEP_PREFIX_METADATA: StepPrefixDeprecationInfo[];
export declare function getStepPrefixDeprecationInfo(stepType: string): StepDeprecationInfo | undefined;
export declare function getStepDeprecationInfo(stepType: string): StepDeprecationInfo | undefined;
export declare function isDeprecatedStepType(stepType: string): boolean;
export declare function getDeprecatedStepMessage(stepType: string, deprecation: StepDeprecationInfo): string;
