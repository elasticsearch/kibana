import { BulkGapsFillStep } from './types';
import type { RulesClientContext } from '../../../../rules_client';
export type BulkGapFillError = ReturnType<typeof toBulkGapFillError>;
export declare const toBulkGapFillError: (rule: {
    id: string;
    name: string;
}, step: BulkGapsFillStep, error: Error) => {
    rule: {
        id: string;
        name: string;
    };
    step: BulkGapsFillStep;
    errorMessage: string;
};
export declare const logProcessedAsAuditEvent: (context: RulesClientContext, { id, name }: {
    id: string;
    name: string;
}, error?: Error) => void;
