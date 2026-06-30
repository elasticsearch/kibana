import React from 'react';
import type { AlertSummaryWidgetProps } from '.';
import type { AlertSummaryWidgetDependencies } from './types';
export declare const AlertSummaryWidget: ({ chartProps, ruleTypeIds, consumers, filter, fullSize, onClick, timeRange, hideChart, hideStats, onLoaded, dependencies: { charts, uiSettings }, }: AlertSummaryWidgetProps & AlertSummaryWidgetDependencies) => React.JSX.Element | null;
export { AlertSummaryWidget as default };
