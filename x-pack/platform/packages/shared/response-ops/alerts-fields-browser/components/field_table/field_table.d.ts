import React from 'react';
import type { BrowserFields } from '@kbn/rule-registry-plugin/common';
import type { FieldBrowserProps, GetFieldTableColumns } from '../../types';
export interface FieldTableProps extends Pick<FieldBrowserProps, 'columnIds' | 'onToggleColumn'> {
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
     * Optional function to customize field table columns
     */
    getFieldTableColumns?: GetFieldTableColumns;
    /**
     * The category selected on the left-hand side of the field browser
     */
    selectedCategoryIds: string[];
    /** The text displayed in the search input */
    /** Invoked when a user chooses to view a new set of columns in the timeline */
    searchInput: string;
    /**
     * Hides the field browser when invoked
     */
    onHide: () => void;
}
export declare const FieldTable: React.NamedExoticComponent<FieldTableProps>;
