import React from 'react';
import type { ComponentOpts as ConnectorApis } from '../../common/components/with_actions_api_operations';
export type ConnectorEventLogListKPIProps = {
    dateStart: string;
    dateEnd: string;
    outcomeFilter?: string[];
    message?: string;
    refreshToken?: number;
    namespaces?: Array<string | undefined>;
} & Pick<ConnectorApis, 'loadGlobalConnectorExecutionKPIAggregations'>;
export declare const ConnectorEventLogListKPI: (props: ConnectorEventLogListKPIProps) => React.JSX.Element;
export declare const ConnectorEventLogListKPIWithApi: React.FunctionComponent<import("../../common/components/with_actions_api_operations").PropsWithOptionalApiHandlers<{
    dateStart: string;
    dateEnd: string;
    outcomeFilter?: string[];
    message?: string;
    refreshToken?: number;
    namespaces?: Array<string | undefined>;
} & Pick<ConnectorApis, "loadGlobalConnectorExecutionKPIAggregations">>>;
