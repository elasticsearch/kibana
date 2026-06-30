import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import type { ConnectorServices } from '../../types';
export interface ConnectorContextValue {
    services: ConnectorServices;
    isServerless?: boolean;
}
export declare const ConnectorContext: React.Context<ConnectorContextValue | undefined>;
export declare const ConnectorProvider: FC<PropsWithChildren<{
    value: ConnectorContextValue;
}>>;
