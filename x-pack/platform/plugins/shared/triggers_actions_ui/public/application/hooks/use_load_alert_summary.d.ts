import type { estypes } from '@elastic/elasticsearch';
import type { Alert, AlertSummaryTimeRange } from '../sections/alert_summary_widget/types';
interface UseLoadAlertSummaryProps {
    ruleTypeIds?: string[];
    consumers?: string[];
    timeRange: AlertSummaryTimeRange;
    filter?: NonNullable<estypes.QueryDslQueryContainer>;
}
interface AlertSummary {
    activeAlertCount: number;
    activeAlerts: Alert[];
    recoveredAlertCount: number;
}
interface LoadAlertSummaryResponse {
    isLoading: boolean;
    alertSummary: AlertSummary;
    error?: string;
}
export declare function useLoadAlertSummary({ ruleTypeIds, consumers, timeRange, filter, }: UseLoadAlertSummaryProps): LoadAlertSummaryResponse;
export {};
