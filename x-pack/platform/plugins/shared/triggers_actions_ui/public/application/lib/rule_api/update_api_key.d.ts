import type { HttpSetup } from '@kbn/core/public';
import type { KueryNode } from '@kbn/es-query';
import type { BulkEditResponse } from '../../../types';
export declare function updateAPIKey({ id, http }: {
    id: string;
    http: HttpSetup;
}): Promise<string>;
export interface BulkUpdateAPIKeyProps {
    ids?: string[];
    filter?: KueryNode | null | undefined;
}
export declare function bulkUpdateAPIKey({ ids, filter, http, }: BulkUpdateAPIKeyProps & {
    http: HttpSetup;
}): Promise<BulkEditResponse>;
