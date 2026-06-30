import React from 'react';
import type { IExecutionLogResult, IExecutionKPIResult } from '@kbn/actions-plugin/common';
import type { ActionType } from '../../../../types';
import type { LoadGlobalConnectorExecutionKPIAggregationsProps } from '../../../lib/action_connector_api/load_execution_kpi_aggregations';
import type { LoadGlobalConnectorExecutionLogAggregationsProps } from '../../../lib/action_connector_api/load_execution_log_aggregations';
export interface ComponentOpts {
    loadActionTypes: () => Promise<ActionType[]>;
    loadGlobalConnectorExecutionLogAggregations: (props: LoadGlobalConnectorExecutionLogAggregationsProps) => Promise<IExecutionLogResult>;
    loadGlobalConnectorExecutionKPIAggregations: (props: LoadGlobalConnectorExecutionKPIAggregationsProps) => Promise<IExecutionKPIResult>;
}
export type PropsWithOptionalApiHandlers<T> = Omit<T, keyof ComponentOpts> & Partial<ComponentOpts>;
export declare function withActionOperations<T>(WrappedComponent: React.ComponentType<T & ComponentOpts>): React.FunctionComponent<PropsWithOptionalApiHandlers<T>>;
