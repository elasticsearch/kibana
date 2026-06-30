import type { HttpSetup } from '@kbn/core/public';
export interface LoadGlobalConnectorExecutionKPIAggregationsProps {
    outcomeFilter?: string[];
    message?: string;
    dateStart: string;
    dateEnd?: string;
    namespaces?: Array<string | undefined>;
}
export declare const loadGlobalConnectorExecutionKPIAggregations: ({ http, outcomeFilter, message, dateStart, dateEnd, namespaces, }: LoadGlobalConnectorExecutionKPIAggregationsProps & {
    http: HttpSetup;
}) => Promise<{
    success: number;
    unknown: number;
    failure: number;
    warning: number;
}>;
