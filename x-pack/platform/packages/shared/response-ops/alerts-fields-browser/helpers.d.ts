import type { EcsMetadata } from '@kbn/alerts-as-data-utils/src/field_maps/types';
import type { BrowserField, BrowserFields } from '@kbn/rule-registry-plugin/common';
export declare const FIELD_BROWSER_WIDTH = 925;
export declare const TABLE_HEIGHT = 260;
/** Returns true if the specified category has at least one field */
export declare const categoryHasFields: (category: Partial<BrowserField>) => boolean;
/** Returns the count of fields in the specified category */
export declare const getFieldCount: (category: Partial<BrowserField> | undefined) => number;
/**
 * Filters the specified `BrowserFields` to return a new collection where every
 * category contains at least one field name that matches the specified substring.
 */
export declare function filterBrowserFieldsByFieldName({ browserFields, substring, }: {
    browserFields: BrowserFields;
    substring: string;
}): BrowserFields;
/**
 * Filters the selected `BrowserFields` to return a new collection where every
 * category contains at least one field that is present in the `columnIds`.
 */
export declare const filterSelectedBrowserFields: ({ browserFields, columnIds, }: {
    browserFields: BrowserFields;
    columnIds: string[];
}) => BrowserFields;
export declare const getIconFromType: (type: string | null | undefined) => "number" | "string" | "question" | "clock" | "globe";
export declare const getEmptyValue: () => string;
export declare const getCategory: (fieldName: string) => string;
export declare const getDescription: (fieldName: string, ecsFlat: Record<string, EcsMetadata>) => string;
/** Returns example text, or an empty string if the field does not have an example */
export declare const getExampleText: (example: string | number | null | undefined) => string;
/** Returns `true` if the escape key was pressed */
export declare const isEscape: (event: React.KeyboardEvent) => boolean;
export declare const CATEGORY_TABLE_CLASS_NAME = "category-table";
export declare const CLOSE_BUTTON_CLASS_NAME = "close-button";
export declare const RESET_FIELDS_CLASS_NAME = "reset-fields";
