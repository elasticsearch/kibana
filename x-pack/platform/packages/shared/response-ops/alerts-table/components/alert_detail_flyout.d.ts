import React from 'react';
import type { AdditionalContext, RenderContext } from '../types';
export declare const AlertDetailFlyout: ({ pageSize, pageIndex, expandedAlertIndex, onExpandedAlertIndexChange, alerts, alertsCount, isLoading, columns, openLinksInNewTab, alertDetailsNavigation, services, ownFocus, hasPagination, }: Omit<RenderContext<AdditionalContext>, "expandedAlertIndex"> & {
    expandedAlertIndex: number;
    ownFocus?: boolean;
    hasPagination?: boolean;
}) => React.JSX.Element | null;
export { AlertDetailFlyout as default };
export type AlertDetailFlyout = typeof AlertDetailFlyout;
