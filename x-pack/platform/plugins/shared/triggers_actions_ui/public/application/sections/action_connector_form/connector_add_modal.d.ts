import React from 'react';
import type { ActionType, ActionConnector, ActionTypeRegistryContract } from '../../../types';
export interface ConnectorAddModalProps {
    actionType: ActionType;
    onClose: () => void;
    postSaveEventHandler?: (savedAction: ActionConnector) => void;
    actionTypeRegistry: ActionTypeRegistryContract;
}
declare const ConnectorAddModal: ({ actionType: tempActionType, onClose, postSaveEventHandler, actionTypeRegistry, }: ConnectorAddModalProps) => React.JSX.Element;
export { ConnectorAddModal as default };
