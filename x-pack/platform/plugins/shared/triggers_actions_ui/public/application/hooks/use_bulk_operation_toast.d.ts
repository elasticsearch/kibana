import type { BulkOperationError } from '@kbn/alerting-plugin/server';
export declare const useBulkOperationToast: ({ onSearchPopulate, }: {
    onSearchPopulate?: (filter: string) => void;
}) => {
    showToast: ({ action, errors, total, }: {
        action: "DELETE" | "ENABLE" | "DISABLE";
        errors: BulkOperationError[];
        total: number;
    }) => void;
};
