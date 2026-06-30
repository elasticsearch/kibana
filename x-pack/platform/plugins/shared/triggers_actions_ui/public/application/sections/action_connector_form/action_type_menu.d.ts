import React from 'react';
import type { IconType } from '@elastic/eui';
import type { ActionType, ActionTypeIndex, ActionTypeRegistryContract } from '../../../types';
interface Props {
    onActionTypeChange: (actionType: ActionType) => void;
    featureId?: string;
    setHasActionsUpgradeableByTrial?: (value: boolean) => void;
    setAllActionTypes?: (actionsType: ActionTypeIndex) => void;
    actionTypeRegistry: ActionTypeRegistryContract;
    searchValue?: string;
    selectedFeatureIds?: string[];
}
export declare function getConnectorIcon(id: string): IconType;
export declare const ActionTypeMenu: ({ onActionTypeChange, featureId, setHasActionsUpgradeableByTrial, setAllActionTypes, actionTypeRegistry, searchValue, selectedFeatureIds, }: Props) => React.JSX.Element;
export {};
