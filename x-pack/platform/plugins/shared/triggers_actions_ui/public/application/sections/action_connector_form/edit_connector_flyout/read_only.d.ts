import React from 'react';
import type { ActionTypeModel } from '../../../..';
export declare const ReadOnlyConnectorMessage: React.FC<{
    connectorId: string;
    connectorName: string;
    extraComponent?: ActionTypeModel['actionReadOnlyExtraComponent'];
    href: string;
}>;
