import React from 'react';
import type { Alert } from '@kbn/alerting-types';
import type { ItemsSelectionState } from './items/types';
interface Props {
    selectedAlerts: Alert[];
    tags: string[];
    isLoading: boolean;
    onChangeTags: (args: ItemsSelectionState) => void;
}
export declare const EditTagsSelectable: React.NamedExoticComponent<Props>;
export {};
