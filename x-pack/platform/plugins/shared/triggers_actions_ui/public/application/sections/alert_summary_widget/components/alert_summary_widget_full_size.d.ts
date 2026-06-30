import React from 'react';
import type { Alert, ChartProps, DependencyProps } from '../types';
export interface AlertSummaryWidgetFullSizeProps {
    activeAlertCount: number;
    activeAlerts: Alert[];
    chartProps?: ChartProps;
    recoveredAlertCount: number;
    timeZone: string;
    dateFormat?: string;
    hideChart?: boolean;
    hideStats?: boolean;
    dependencyProps: DependencyProps;
}
export declare const AlertSummaryWidgetFullSize: ({ activeAlertCount, activeAlerts, chartProps: { themeOverrides, onBrushEnd }, dateFormat, recoveredAlertCount, timeZone, hideChart, hideStats, dependencyProps: { baseTheme }, }: AlertSummaryWidgetFullSizeProps) => React.JSX.Element;
