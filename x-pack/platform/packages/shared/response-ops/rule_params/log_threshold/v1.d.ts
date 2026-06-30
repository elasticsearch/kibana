declare enum Comparator {
    GT = "more than",
    GT_OR_EQ = "more than or equals",
    LT = "less than",
    LT_OR_EQ = "less than or equals",
    EQ = "equals",
    NOT_EQ = "does not equal",
    MATCH = "matches",
    NOT_MATCH = "does not match",
    MATCH_PHRASE = "matches phrase",
    NOT_MATCH_PHRASE = "does not match phrase"
}
export declare const logThresholdParamsSchema: import("@kbn/config-schema").Type<Readonly<{
    groupBy?: string[] | undefined;
} & {
    count: Readonly<{} & {
        value: number;
        comparator: Comparator;
    }>;
    criteria: Readonly<{} & {
        value: string | number;
        field: string;
        comparator: Comparator;
    }>[];
    timeUnit: "s" | "d" | "m" | "h";
    timeSize: number;
    logView: Readonly<{} & {
        type: "log-view-reference";
        logViewId: string;
    }>;
}> | Readonly<{
    groupBy?: string[] | undefined;
} & {
    count: Readonly<{} & {
        value: number;
        comparator: Comparator;
    }>;
    criteria: Readonly<{} & {
        value: string | number;
        field: string;
        comparator: Comparator;
    }>[][];
    timeUnit: "s" | "d" | "m" | "h";
    timeSize: number;
    logView: Readonly<{} & {
        type: "log-view-reference";
        logViewId: string;
    }>;
}>>;
export type LogThresholdParams = ReturnType<typeof logThresholdParamsSchema.validate>;
export {};
