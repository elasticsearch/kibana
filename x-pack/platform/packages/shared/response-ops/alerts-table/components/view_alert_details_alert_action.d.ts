import React from 'react';
import type { AdditionalContext, AlertActionsProps } from '../types';
/**
 * Alerts table row action to open the selected alert detail page
 */
export declare const ViewAlertDetailsAlertAction: <AC extends AdditionalContext = AdditionalContext>({ alert, rowIndex, onExpandedAlertIndexChange, onActionExecuted, alertDetailsNavigation, openLinksInNewTab, }: AlertActionsProps<AC>) => React.JSX.Element;
