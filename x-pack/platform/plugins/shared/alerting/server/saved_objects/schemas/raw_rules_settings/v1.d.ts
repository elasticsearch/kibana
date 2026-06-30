export declare const rawRulesSettingsSchema: import("@kbn/config-schema").ObjectType<{
    flapping: import("@kbn/config-schema").Type<Readonly<{} & {
        enabled: boolean;
        createdBy: string | null;
        createdAt: string;
        updatedBy: string | null;
        updatedAt: string;
        lookBackWindow: number;
        statusChangeThreshold: number;
    }> | undefined>;
    queryDelay: import("@kbn/config-schema").Type<Readonly<{} & {
        createdBy: string | null;
        createdAt: string;
        updatedBy: string | null;
        updatedAt: string;
        delay: number;
    }> | undefined>;
}>;
