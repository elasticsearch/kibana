export declare const scheduleBackfillParamSchema: import("@kbn/config-schema").ObjectType<{
    ruleId: import("@kbn/config-schema").Type<string>;
    ranges: import("@kbn/config-schema").Type<Readonly<{} & {
        end: string;
        start: string;
    }>[]>;
    runActions: import("@kbn/config-schema").Type<boolean | undefined>;
    initiator: import("@kbn/config-schema").Type<"user" | "system">;
    initiatorId: import("@kbn/config-schema").Type<string | undefined>;
}>;
export declare const scheduleBackfillParamsSchema: import("@kbn/config-schema").Type<Readonly<{
    initiatorId?: string | undefined;
    runActions?: boolean | undefined;
} & {
    ruleId: string;
    initiator: "user" | "system";
    ranges: Readonly<{} & {
        end: string;
        start: string;
    }>[];
}>[]>;
