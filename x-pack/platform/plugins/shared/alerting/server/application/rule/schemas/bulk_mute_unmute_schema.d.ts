export declare const bulkMuteUnmuteAlertsParamsSchema: import("@kbn/config-schema").ObjectType<{
    rules: import("@kbn/config-schema").Type<Readonly<{} & {
        id: string;
        alertInstanceIds: string[];
    }>[]>;
}>;
