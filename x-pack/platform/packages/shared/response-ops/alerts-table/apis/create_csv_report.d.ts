import type { HttpStart } from '@kbn/core-http-browser';
export interface CreateCsvReportParams {
    http: HttpStart;
    title: string;
    objectType: string;
    browserTimezone: string;
    version: string;
    columns: string[];
    searchSource: {
        index: {
            title: string;
            timeFieldName: string;
        };
        query: {
            query: string;
            language: string;
        };
        filter: Array<{
            query: object;
            meta: {
                disabled: boolean;
            };
        }>;
        sort: unknown;
    };
}
export declare const createCsvReport: (params: CreateCsvReportParams) => Promise<void>;
