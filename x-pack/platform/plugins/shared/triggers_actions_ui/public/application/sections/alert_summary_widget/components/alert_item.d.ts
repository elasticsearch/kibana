import React, { type MouseEvent, type ReactNode } from 'react';
import { type EuiTextColorProps } from '@elastic/eui';
import { type PublicAlertStatus } from '@kbn/rule-data-utils';
interface AlertItemProps {
    label: string | ReactNode;
    count: number;
    color: EuiTextColorProps['color'];
    alertType?: PublicAlertStatus;
    handleClick?: (event: MouseEvent<HTMLAnchorElement | HTMLDivElement>, status?: PublicAlertStatus) => void;
    showWarningIcon?: true;
    'data-test-subj'?: string;
}
export declare const AlertItem: ({ label, count, handleClick, alertType, color, showWarningIcon, "data-test-subj": dataTestSubj, }: AlertItemProps) => React.JSX.Element;
export {};
