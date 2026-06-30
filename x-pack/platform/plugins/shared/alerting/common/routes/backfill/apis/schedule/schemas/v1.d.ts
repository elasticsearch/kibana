export declare const scheduleBackfillExamples: () => string;
export declare const scheduleBodySchema: import("@kbn/config-schema").Type<Readonly<{
    run_actions?: boolean | undefined;
} & {
    rule_id: string;
    ranges: Readonly<{} & {
        end: string;
        start: string;
    }>[];
}>[]>;
export declare const scheduleResponseSchema: import("@kbn/config-schema").Type<(Readonly<{
    end?: string | undefined;
    initiator_id?: string | undefined;
} & {
    id: string;
    start: string;
    status: "error" | "pending" | "running" | "complete" | "timeout";
    duration: string;
    schedule: Readonly<{} & {
        status: "error" | "pending" | "running" | "complete" | "timeout";
        interval: string;
        run_at: string;
    }>[];
    enabled: boolean;
    rule: Readonly<{
        api_key_created_by_user?: boolean | null | undefined;
    } & {
        id: string;
        name: string;
        schedule: Readonly<{} & {
            interval: string;
        }>;
        params: Record<string, any>;
        enabled: boolean;
        tags: string[];
        consumer: string;
        created_at: string;
        updated_at: string;
        created_by: string | null;
        updated_by: string | null;
        revision: number;
        api_key_owner: string | null;
        rule_type_id: string;
    }>;
    space_id: string;
    created_at: string;
    initiator: "user" | "system";
}> | Readonly<{} & {
    error: Readonly<{
        status?: number | undefined;
    } & {
        message: string;
        rule: Readonly<{
            name?: string | undefined;
        } & {
            id: string;
        }>;
    }>;
}>)[]>;
