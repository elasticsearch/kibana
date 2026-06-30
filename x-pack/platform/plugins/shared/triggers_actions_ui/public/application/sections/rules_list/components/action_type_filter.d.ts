import React from 'react';
import type { ActionType } from '../../../../types';
interface ActionTypeFilterProps {
    actionTypes: ActionType[];
    onChange: (selectedActionTypeIds: string[]) => void;
    filters: string[];
}
export declare const ActionTypeFilter: React.FunctionComponent<ActionTypeFilterProps>;
export {};
