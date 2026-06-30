import type { BrowserFields } from '@kbn/rule-registry-plugin/common';
import type { BrowserFieldItem, FieldTableColumns, GetFieldTableColumns } from '../../types';
/**
 * Returns the field items of all categories selected
 */
export declare const getFieldItemsData: ({ browserFields, selectedCategoryIds, columnIds, }: {
    browserFields: BrowserFields;
    selectedCategoryIds: string[];
    columnIds: string[];
}) => {
    fieldItems: BrowserFieldItem[];
};
/**
 * Returns a table column template provided to the `EuiInMemoryTable`'s
 * `columns` prop
 */
export declare const getFieldColumns: ({ getFieldTableColumns, highlight, onHide, onToggleColumn, }: {
    getFieldTableColumns?: GetFieldTableColumns;
    highlight?: string;
    onHide: () => void;
    onToggleColumn: (id: string) => void;
}) => FieldTableColumns;
