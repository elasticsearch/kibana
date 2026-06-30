import type { Alert } from '@kbn/alerting-types';
import type { CasesService } from '../types';
export declare const useCaseActions: ({ alerts, cases, onAddToCase, }: {
    alerts: Alert[];
    cases?: CasesService;
    onAddToCase?: (opts: {
        isNewCase: boolean;
    }) => void;
}) => {
    handleAddToExistingCaseClick: () => void;
    handleAddToNewCaseClick: () => void;
};
