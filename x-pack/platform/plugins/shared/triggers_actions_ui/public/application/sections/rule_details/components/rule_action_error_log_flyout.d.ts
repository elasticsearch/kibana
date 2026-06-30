import React from 'react';
import type { IExecutionLog } from '@kbn/alerting-plugin/common';
import type { RefreshToken } from './types';
export interface RuleActionErrorLogFlyoutProps {
    runLog: IExecutionLog;
    refreshToken?: RefreshToken;
    onClose: () => void;
    activeSpaceId?: string;
}
export declare const RuleActionErrorLogFlyout: (props: RuleActionErrorLogFlyoutProps) => React.JSX.Element;
