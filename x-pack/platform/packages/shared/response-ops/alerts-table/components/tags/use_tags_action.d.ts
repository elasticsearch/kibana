import React from 'react';
import type { Alert } from '@kbn/alerting-types';
import type { ItemsSelectionState, UseActionProps } from './items/types';
export interface TagsActionState {
    isFlyoutOpen: boolean;
    onClose: () => void;
    openFlyout: (alerts: Alert[]) => void;
    onSaveTags: (tagsSelection: ItemsSelectionState) => Promise<void>;
    selectedAlerts: Alert[];
    getAction: (alerts: Alert[]) => {
        name: string;
        onClick: () => void;
        disabled: boolean;
        'data-test-subj': string;
        icon: React.ReactNode;
        key: string;
    };
}
export declare const useTagsAction: ({ onActionSuccess, onActionError, isDisabled, }: UseActionProps) => TagsActionState;
export type UseTagsAction = ReturnType<typeof useTagsAction>;
