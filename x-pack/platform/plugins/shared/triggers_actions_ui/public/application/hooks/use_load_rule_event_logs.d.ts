import type { LoadExecutionLogAggregationsProps, LoadGlobalExecutionLogAggregationsProps } from '../lib/rule_api/load_execution_log_aggregations';
interface CommonProps {
    onError?: (err: any) => void;
}
type LoadExecutionLogProps = LoadExecutionLogAggregationsProps & CommonProps;
type LoadGlobalExecutionLogProps = LoadGlobalExecutionLogAggregationsProps & CommonProps;
export type UseLoadRuleEventLogsProps = LoadExecutionLogProps | LoadGlobalExecutionLogProps;
export declare function useLoadRuleEventLogs(props: UseLoadRuleEventLogsProps): {
    data: import("../../../../alerting/common").IExecutionLogResult | undefined;
    hasExceedLogs: any;
    isLoading: boolean;
    loadEventLogs: <TPageData>(options?: (import("@kbn/react-query").RefetchOptions & import("@kbn/react-query").RefetchQueryFilters<TPageData>) | undefined) => Promise<import("@kbn/react-query").QueryObserverResult<import("../../../../alerting/common").IExecutionLogResult, any>>;
};
export {};
