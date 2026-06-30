import type { CaseStatuses } from '@kbn/cases-components';
import type { HttpStart } from '@kbn/core-http-browser';
export interface Case {
    title: string;
    description: string;
    status: CaseStatuses;
    totalComment: number;
    created_at: string;
    created_by: {
        email: string | null | undefined;
        full_name: string | null | undefined;
        username: string | null | undefined;
    };
    id: string;
    owner: string;
    version: string;
}
export type Cases = Case[];
export interface CasesBulkGetResponse {
    cases: Cases;
    errors: Array<{
        caseId: string;
        error: string;
        message: string;
        status?: number;
    }>;
}
export declare const bulkGetCases: (http: HttpStart, params: {
    ids: string[];
}, signal?: AbortSignal) => Promise<CasesBulkGetResponse>;
