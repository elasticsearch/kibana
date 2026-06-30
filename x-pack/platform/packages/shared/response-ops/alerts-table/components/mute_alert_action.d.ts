import React from 'react';
import type { AdditionalContext, AlertActionsProps } from '../types';
/**
 * Alerts table row action to mute/unmute the selected alert
 */
export declare const MuteAlertAction: <AC extends AdditionalContext = AdditionalContext>({ alert, refresh, onActionExecuted, }: AlertActionsProps<AC>) => React.JSX.Element | null;
