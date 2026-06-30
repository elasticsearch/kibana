export declare const ruleQueryInspectorExamples: () => string;
export declare const ruleQueryInspectorParamsSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
}>;
export declare const ruleQueryInspectorQuerySchema: import("@kbn/config-schema").ObjectType<{
    mode: import("@kbn/config-schema").Type<"execute" | "build">;
    alert_id: import("@kbn/config-schema").Type<string | undefined>;
}>;
export declare const ruleQueryInspectorResponseSchema: import("@kbn/config-schema").ObjectType<{
    queries: import("@kbn/config-schema").Type<Readonly<{
        label?: string | undefined;
        response?: Record<string, any> | undefined;
    } & {
        index: string;
        request: Record<string, any>;
    }>[]>;
}>;
