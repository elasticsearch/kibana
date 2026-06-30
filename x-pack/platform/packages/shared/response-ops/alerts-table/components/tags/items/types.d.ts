import type { EuiSelectableOption, IconType } from '@elastic/eui';
export interface UseActionProps {
    onAction?: () => void;
    onActionSuccess?: () => void;
    onActionError?: () => void;
    isDisabled: boolean;
}
export interface ItemsSelectionState {
    selectedItems: string[];
    unSelectedItems: string[];
}
export type ItemSelectableOption<T extends {} = {}> = EuiSelectableOption<T & {
    key: string;
    itemIcon: IconType;
    newItem?: boolean;
}>;
