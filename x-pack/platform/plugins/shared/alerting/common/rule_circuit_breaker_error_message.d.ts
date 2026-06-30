export declare const getRuleCircuitBreakerErrorMessage: ({ name, interval, intervalAvailable, action, rules, }: {
    name?: string;
    interval: number;
    intervalAvailable: number;
    action: "update" | "create" | "enable" | "bulkEdit" | "bulkEnable" | "bulkCreate";
    rules?: number;
}) => string;
export declare const parseRuleCircuitBreakerErrorMessage: (message: string) => {
    summary: string;
    details?: string;
};
