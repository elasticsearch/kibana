export declare const INTERNAL_ROUTES: {
    MIGRATE: {
        MIGRATE_ILM_POLICY: string;
        GET_ILM_POLICY_STATUS: string;
    };
    DIAGNOSE: {
        BROWSER: string;
        SCREENSHOT: string;
    };
    JOBS: {
        COUNT: string;
        LIST: string;
        INFO_PREFIX: string;
        DELETE_PREFIX: string;
        DOWNLOAD_PREFIX: string;
    };
    SCHEDULED: {
        LIST: string;
        BULK_DISABLE: string;
        BULK_DELETE: string;
        BULK_ENABLE: string;
    };
    HEALTH: string;
    GENERATE_PREFIX: string;
    SCHEDULE_PREFIX: string;
};
export declare const PUBLIC_ROUTES: {
    /**
     * Public endpoint for POST URL strings and automated report generation
     * exportTypeId is added to the final path
     */
    GENERATE_PREFIX: string;
    JOBS: {
        /**
         * Public endpoint used by Watcher and automated report downloads
         * jobId is added to the final path
         */
        DOWNLOAD_PREFIX: string;
        /**
         * Public endpoint potentially used to delete a report after download in automation
         * jobId is added to the final path
         */
        DELETE_PREFIX: string;
    };
};
