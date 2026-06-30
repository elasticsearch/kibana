import type { EuiSelectableOption, IconType } from '@elastic/eui';
import type { Alert } from '@kbn/alerting-types';
import type { ItemSelectableOption, ItemsSelectionState } from './types';
interface UseItemsStateProps {
    items: string[];
    selectedAlerts: Alert[];
    itemToSelectableOption: <T>(item: Payload[number]) => EuiSelectableOption<T>;
    fieldSelector: (alert: Alert) => string[];
    onChangeItems: (args: ItemsSelectionState) => void;
}
declare enum ItemState {
    CHECKED = "checked",
    PARTIAL = "partial",
    UNCHECKED = "unchecked"
}
export declare enum Actions {
    CHECK_ITEM = 0,
    UNCHECK_ITEM = 1,
    SET_NEW_STATE = 2
}
type Payload = Array<Pick<Item, 'key' | 'data'>>;
interface Item {
    key: string;
    itemState: ItemState;
    dirty: boolean;
    icon: IconType;
    data: Record<string, unknown>;
}
interface State {
    items: Record<string, Item>;
    itemCounterMap: Map<string, number>;
}
export declare const getSelectedAndUnselectedItems: (newOptions: ItemSelectableOption[], items: State["items"]) => {
    selectedItems: Payload;
    unSelectedItems: Payload;
};
export declare const useItemsState: ({ items, selectedAlerts, fieldSelector, itemToSelectableOption, onChangeItems, }: UseItemsStateProps) => {
    state: State;
    options: ((import("@elastic/eui").DisambiguateSet<import("@elastic/eui/src/components/selectable/selectable_option").EuiSelectableGroupLabelOption<{
        key: string;
        itemIcon: IconType;
        newItem?: boolean;
    }>, import("@elastic/eui/src/components/selectable/selectable_option").EuiSelectableLIOption<{
        key: string;
        itemIcon: IconType;
        newItem?: boolean;
    }>> & import("@elastic/eui").CommonProps & {
        label: string;
        searchableLabel?: string;
        key?: string;
        checked?: import("@elastic/eui/src/components/selectable/selectable_option").EuiSelectableOptionCheckedType;
        disabled?: boolean;
        isGroupLabel?: false;
        prepend?: React.ReactNode;
        append?: React.ReactNode;
        ref?: (optionIndex: number) => void;
        id?: never;
        data?: {
            [key: string]: any;
        };
        textWrap?: "truncate" | "wrap";
        truncationProps?: Partial<Omit<import("@elastic/eui").EuiTextTruncateProps, "text" | "children">>;
        toolTipContent?: import("@elastic/eui").EuiToolTipProps["content"];
        toolTipProps?: Partial<Omit<import("@elastic/eui").EuiToolTipProps, "content" | "children">>;
    } & import("react").HTMLAttributes<HTMLLIElement> & {
        key: string;
        itemIcon: IconType;
        newItem?: boolean;
    }) | (import("@elastic/eui").DisambiguateSet<import("@elastic/eui/src/components/selectable/selectable_option").EuiSelectableLIOption<{
        key: string;
        itemIcon: IconType;
        newItem?: boolean;
    }>, import("@elastic/eui/src/components/selectable/selectable_option").EuiSelectableGroupLabelOption<{
        key: string;
        itemIcon: IconType;
        newItem?: boolean;
    }>> & Omit<import("@elastic/eui/src/components/selectable/selectable_option").EuiSelectableOptionBase, "isGroupLabel"> & import("react").HTMLAttributes<HTMLDivElement> & {
        isGroupLabel: true;
    } & {
        key: string;
        itemIcon: IconType;
        newItem?: boolean;
    }))[];
    totalSelectedItems: number;
    onChange: (newOptions: ItemSelectableOption[]) => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
    resetItems: (newItems: string[]) => void;
};
export type UseItemsState = ReturnType<typeof useItemsState>;
export {};
