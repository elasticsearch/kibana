import React from 'react';
import type { Alert } from '@kbn/alerting-types';
import type { CasesOwner, CasesService } from '../types';
/**
 * Returns "Add to existing case" and "Add to new case" context menu items
 * for the alerts table actions popover.
 *
 * Returns an empty array if the cases service is unavailable or the user lacks permissions.
 */
export declare const useCaseAlertActionItems: ({ alert, cases, refresh, onAddToCase, onActionExecuted, owner, }: {
    alert: Alert;
    cases?: CasesService;
    refresh: () => void;
    onAddToCase?: (opts: {
        isNewCase: boolean;
    }) => void;
    onActionExecuted?: () => void;
    owner?: CasesOwner[];
}) => React.ReactElement[];
