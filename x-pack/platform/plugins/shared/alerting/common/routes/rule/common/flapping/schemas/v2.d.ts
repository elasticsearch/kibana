export declare const flappingSchema: import("@kbn/config-schema").ObjectType<Omit<{
    look_back_window: import("@kbn/config-schema").Type<number>;
    status_change_threshold: import("@kbn/config-schema").Type<number>;
}, "enabled"> & {
    enabled: import("@kbn/config-schema").Type<boolean | undefined>;
}>;
