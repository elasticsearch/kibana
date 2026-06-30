import React from 'react';
import type { ActionConnector } from '../../../../types';
import { EditConnectorTabs } from '../../../../types';
declare const ActionsConnectorsList: ({ setAddFlyoutVisibility, editItem, isLoadingActions, actions, loadActions, setActions, connectorAuthStatusError, }: {
    setAddFlyoutVisibility: (state: boolean) => void;
    editItem: (actionConnector: ActionConnector, tab: EditConnectorTabs, isFix?: boolean) => void;
    isLoadingActions: boolean;
    actions: ActionConnector[];
    loadActions: () => Promise<void>;
    setActions: (state: ActionConnector[]) => void;
    connectorAuthStatusError?: string;
}) => React.JSX.Element;
export { ActionsConnectorsList as default };
