import React from 'react';
import type { AdditionalContext, AlertActionsProps } from '../types';
/**
 * Alerts table row action to mark the selected alert as untracked
 */
export declare const MarkAsUntrackedAlertAction: <AC extends AdditionalContext = AdditionalContext>({ alert, refresh, onActionExecuted, }: AlertActionsProps<AC>) => React.JSX.Element | null;
