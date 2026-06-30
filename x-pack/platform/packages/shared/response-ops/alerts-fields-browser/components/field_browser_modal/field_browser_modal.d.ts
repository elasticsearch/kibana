import React from 'react';
import type { BrowserFields } from '@kbn/rule-registry-plugin/common';
import type { FieldBrowserProps } from '../../types';
export type FieldBrowserModalProps = Pick<FieldBrowserProps, 'width' | 'onResetColumns' | 'onToggleColumn' | 'options'> & {
    /**
     * The current timeline column headers
     */
    columnIds: string[];
    /**
     * A map of categoryId -> metadata about the fields in that category,
     * filtered such that the name of every field in the category includes
     * the filter input (as a substring).
     */
    filteredBrowserFields: BrowserFields;
    /** when true, show only the the selected field */
    filterSelectedEnabled: boolean;
    onFilterSelectedChange: (enabled: boolean) => void;
    /**
     * When true, a busy spinner will be shown to indicate the field browser
     * is searching for fields that match the specified `searchInput`
     */
    isSearching: boolean;
    /** The text displayed in the search input */
    searchInput: string;
    /** The text actually being applied to the result set, a debounced version of searchInput */
    appliedFilterInput: string;
    /**
     * The category selected on the left-hand side of the field browser
     */
    selectedCategoryIds: string[];
    /**
     * Invoked when the user clicks on the name of a category in the left-hand
     * side of the field browser
     */
    setSelectedCategoryIds: (categoryIds: string[]) => void;
    /**
     * Hides the field browser when invoked
     */
    onHide: () => void;
    /**
     * Invoked when the user types in the search input
     */
    onSearchInputChange: (newSearchInput: string) => void;
    /**
     * Focus will be restored to this button if the user presses Escape or clicks
     * the close button. Focus will NOT be restored if the user clicks outside
     * of the popover.
     */
    restoreFocusTo: React.MutableRefObject<HTMLButtonElement | null>;
};
export declare const FieldBrowserModal: React.NamedExoticComponent<FieldBrowserModalProps>;
