import React, { type MouseEvent } from 'react';
import type { PublicAlertStatus } from '@kbn/rule-data-utils';
interface Props {
    activeAlertCount: number;
    recoveredAlertCount: number;
    handleClick?: (event: MouseEvent<HTMLAnchorElement | HTMLDivElement>, status?: PublicAlertStatus) => void;
}
export declare const AlertCounts: ({ activeAlertCount, recoveredAlertCount, handleClick }: Props) => React.JSX.Element;
export {};
