import React from 'react';
import type { Alert } from '@kbn/alerting-types';
import type { ItemsSelectionState } from './items/types';
interface Props {
    selectedAlerts: Alert[];
    onClose: () => void;
    onSaveTags: (args: ItemsSelectionState) => void;
    focusButtonRef?: React.Ref<HTMLButtonElement>;
}
export declare const EditTagsFlyout: React.NamedExoticComponent<Props>;
export {};
