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
export declare const MISSING_UIAM_API_KEY_TAG: string;
/**
 * Feature flag for provisioning UIAM API keys for alerting rules
 */
export declare const PROVISION_UIAM_API_KEYS_FEATURE_FLAG = "alerting.rules.provisionUiamApiKeys";
