import type { RulesConfig } from '../config';
export declare const DEFAULT_EXECUTION_TIMEOUT = "5m";
export declare const getRuleTaskTimeout: ({ config, ruleTaskTimeout, ruleTypeId, }: {
    config: RulesConfig;
    ruleTaskTimeout?: string;
    ruleTypeId: string;
}) => string;
