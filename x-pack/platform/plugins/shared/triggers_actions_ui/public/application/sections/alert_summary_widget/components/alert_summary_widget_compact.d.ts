import React from 'react';
import type { PublicAlertStatus } from '@kbn/rule-data-utils';
import type { Alert, ChartProps, DependencyProps } from '../types';
export interface AlertSummaryWidgetCompactProps {
    activeAlertCount: number;
    activeAlerts: Alert[];
    chartProps?: ChartProps;
    recoveredAlertCount: number;
    timeRangeTitle?: JSX.Element | string;
    onClick: (status?: PublicAlertStatus) => void;
    dependencyProps: DependencyProps;
}
export declare const AlertSummaryWidgetCompact: ({ activeAlertCount, activeAlerts, chartProps: { themeOverrides }, recoveredAlertCount, timeRangeTitle, onClick, dependencyProps: { baseTheme, sparklineTheme }, }: AlertSummaryWidgetCompactProps) => React.JSX.Element;
