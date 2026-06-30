import React from 'react';
import type { ComponentOpts as ConnectorApis } from '../../common/components/with_actions_api_operations';
export type ConnectorEventLogListOptions = 'stackManagement' | 'default';
export type ConnectorEventLogListCommonProps = {
    localStorageKey?: string;
    refreshToken?: number;
    initialPageSize?: number;
    hasConnectorNames?: boolean;
    hasAllSpaceSwitch?: boolean;
} & Pick<ConnectorApis, 'loadGlobalConnectorExecutionLogAggregations'>;
export type ConnectorEventLogListTableProps<T extends ConnectorEventLogListOptions = 'default'> = T extends 'default' ? ConnectorEventLogListCommonProps : T extends 'stackManagement' ? ConnectorEventLogListCommonProps : never;
export declare const ConnectorEventLogListTable: <T extends ConnectorEventLogListOptions>(props: ConnectorEventLogListTableProps<T>) => React.JSX.Element;
export declare const ConnectorEventLogListTableWithApi: React.FunctionComponent<import("../../common/components/with_actions_api_operations").PropsWithOptionalApiHandlers<{
    localStorageKey?: string;
    refreshToken?: number;
    initialPageSize?: number;
    hasConnectorNames?: boolean;
    hasAllSpaceSwitch?: boolean;
} & Pick<ConnectorApis, "loadGlobalConnectorExecutionLogAggregations">>>;
export { ConnectorEventLogListTableWithApi as default };
