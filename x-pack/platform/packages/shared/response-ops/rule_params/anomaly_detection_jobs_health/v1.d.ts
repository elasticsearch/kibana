export declare const anomalyDetectionJobsHealthRuleParamsSchema: import("@kbn/config-schema").ObjectType<{
    includeJobs: import("@kbn/config-schema").ObjectType<{
        jobIds: import("@kbn/config-schema").Type<string[]>;
        groupIds: import("@kbn/config-schema").Type<string[]>;
    }>;
    excludeJobs: import("@kbn/config-schema").Type<Readonly<{} & {
        jobIds: string[];
        groupIds: string[];
    }> | null>;
    testsConfig: import("@kbn/config-schema").Type<Readonly<{} & {
        datafeed: Readonly<{} & {
            enabled: boolean;
        }> | null;
        mml: Readonly<{} & {
            enabled: boolean;
        }> | null;
        delayedData: Readonly<{} & {
            enabled: boolean;
            docsCount: number | null;
            timeInterval: string | null;
        }> | null;
        behindRealtime: Readonly<{} & {
            enabled: boolean;
            timeInterval: string | null;
        }> | null;
        errorMessages: Readonly<{} & {
            enabled: boolean;
        }> | null;
    }> | null>;
}>;
