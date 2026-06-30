export declare const getScheduleFrequencyResponseBodySchema: import("@kbn/config-schema").ObjectType<{
    total_scheduled_per_minute: import("@kbn/config-schema").Type<number>;
    remaining_schedules_per_minute: import("@kbn/config-schema").Type<number>;
}>;
export declare const getScheduleFrequencyResponseSchema: import("@kbn/config-schema").ObjectType<{
    body: import("@kbn/config-schema").ObjectType<{
        total_scheduled_per_minute: import("@kbn/config-schema").Type<number>;
        remaining_schedules_per_minute: import("@kbn/config-schema").Type<number>;
    }>;
}>;
