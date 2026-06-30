import React from 'react';
import type { AdditionalContext, AlertActionsProps } from '../types';
/**
 * Alerts table row action to open the rule to which the selected alert is associated
 */
export declare const ViewRuleDetailsAlertAction: <AC extends AdditionalContext = AdditionalContext>({ alert, resolveRulePagePath, tableId, openLinksInNewTab, }: AlertActionsProps<AC>) => React.JSX.Element | null;
