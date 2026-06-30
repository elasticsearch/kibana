import React from 'react';
import type { IconType } from '@elastic/eui';
import type { ActionConnector, ActionTypeRegistryContract } from '../../../../types';
import { EditConnectorTabs } from '../../../../types';
export interface EditConnectorFlyoutProps {
    actionTypeRegistry: ActionTypeRegistryContract;
    connector: ActionConnector;
    onClose: () => void;
    tab?: EditConnectorTabs;
    onConnectorUpdated?: (connector: ActionConnector) => void;
    isServerless?: boolean;
    icon?: IconType;
    hideRulesTab?: boolean;
    isTestable?: boolean;
}
export declare const EditConnectorFlyout: React.NamedExoticComponent<EditConnectorFlyoutProps>;
export { EditConnectorFlyout as default };
