import React from 'react';
import type { RuleAlertingOutcome } from '@kbn/alerting-plugin/common';
interface EventLogListStatusProps {
    status: RuleAlertingOutcome;
    useExecutionStatus?: boolean;
}
export declare const EventLogListStatus: (props: EventLogListStatusProps) => React.JSX.Element;
export {};
