import type { ReactNode } from 'react';
import React from 'react';
import type { EsQuerySnapshot } from '@kbn/alerting-types';
import type { SortCombinations } from '@elastic/elasticsearch/lib/api/types';
import type { AlertsTableProps } from '../types';
declare const heights: {
    tall: number;
    short: number;
};
type EmptyState = NonNullable<AlertsTableProps['emptyState' | 'errorState']>;
type EmptyStateMessage = Pick<EmptyState, 'messageTitle' | 'messageBody'>;
export declare const EmptyState: React.FC<{
    height?: keyof typeof heights | 'flex';
    variant?: 'subdued' | 'transparent';
    additionalToolbarControls?: ReactNode;
    alertsQuerySnapshot?: EsQuerySnapshot;
    showInspectButton?: boolean;
    error?: Error;
    fieldWithSortingError?: SortCombinations;
    onReset?: () => void;
} & EmptyStateMessage>;
export {};
