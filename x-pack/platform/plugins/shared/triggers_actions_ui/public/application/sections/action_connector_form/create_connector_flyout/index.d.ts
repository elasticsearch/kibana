import React from 'react';
import type { IconType } from '@elastic/eui';
import type { ActionConnector, ActionTypeRegistryContract } from '../../../../types';
export interface CreateConnectorFlyoutProps {
    actionTypeRegistry: ActionTypeRegistryContract;
    onClose: () => void;
    featureId?: string;
    onConnectorCreated?: (connector: ActionConnector) => void;
    onTestConnector?: (connector: ActionConnector) => void;
    isServerless?: boolean;
    initialConnector?: Partial<Omit<ActionConnector, 'secrets'>> & {
        actionTypeId: string;
    };
    icon?: IconType;
}
export declare const CreateConnectorFlyout: React.NamedExoticComponent<CreateConnectorFlyoutProps>;
export { CreateConnectorFlyout as default };
