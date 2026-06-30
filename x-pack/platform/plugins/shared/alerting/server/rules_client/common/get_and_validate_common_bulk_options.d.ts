import type { BulkOptions } from '../types';
export declare const getAndValidateCommonBulkOptions: (options: BulkOptions) => {
    ids: string[] | undefined;
    filter: string | import("@kbn/es-query").KueryNode | undefined;
};
