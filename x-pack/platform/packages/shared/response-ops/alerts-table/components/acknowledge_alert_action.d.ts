import React from 'react';
import type { AdditionalContext, AlertActionsProps } from '../types';
/**
 * Alerts table row action to acknowledge (ACK) or unacknowledge (reopen) the selected alert.
 *
 * - "Acknowledge" is shown for active alerts whose workflow_status is 'open'.
 * - "Unacknowledge" is shown for alerts whose workflow_status is 'acknowledged'.
 */
export declare const AcknowledgeAlertAction: <AC extends AdditionalContext = AdditionalContext>({ alert, refresh, onActionExecuted, }: AlertActionsProps<AC>) => React.JSX.Element | null;
