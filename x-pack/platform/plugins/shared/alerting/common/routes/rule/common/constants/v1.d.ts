export declare const ruleNotifyWhen: {
    readonly CHANGE: "onActionGroupChange";
    readonly ACTIVE: "onActiveAlert";
    readonly THROTTLE: "onThrottleInterval";
};
export declare const ruleLastRunOutcomeValues: {
    readonly SUCCEEDED: "succeeded";
    readonly WARNING: "warning";
    readonly FAILED: "failed";
};
export declare const ruleExecutionStatusValues: {
    readonly OK: "ok";
    readonly ACTIVE: "active";
    readonly ERROR: "error";
    readonly WARNING: "warning";
    readonly PENDING: "pending";
    readonly UNKNOWN: "unknown";
};
export declare const ruleExecutionStatusErrorReason: {
    readonly READ: "read";
    readonly DECRYPT: "decrypt";
    readonly EXECUTE: "execute";
    readonly UNKNOWN: "unknown";
    readonly LICENSE: "license";
    readonly TIMEOUT: "timeout";
    readonly DISABLED: "disabled";
    readonly VALIDATE: "validate";
};
export declare const ruleExecutionStatusWarningReason: {
    readonly MAX_EXECUTABLE_ACTIONS: "maxExecutableActions";
    readonly MAX_ALERTS: "maxAlerts";
    readonly MAX_QUEUED_ACTIONS: "maxQueuedActions";
    readonly EXECUTION: "ruleExecution";
};
export type RuleNotifyWhen = (typeof ruleNotifyWhen)[keyof typeof ruleNotifyWhen];
export type RuleLastRunOutcomeValues = (typeof ruleLastRunOutcomeValues)[keyof typeof ruleLastRunOutcomeValues];
export type RuleExecutionStatusValues = (typeof ruleExecutionStatusValues)[keyof typeof ruleExecutionStatusValues];
export type RuleExecutionStatusErrorReason = (typeof ruleExecutionStatusErrorReason)[keyof typeof ruleExecutionStatusErrorReason];
export type RuleExecutionStatusWarningReason = (typeof ruleExecutionStatusWarningReason)[keyof typeof ruleExecutionStatusWarningReason];
