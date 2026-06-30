import React from 'react';
import type { BrowserFields } from '@kbn/rule-registry-plugin/common';
interface CategoriesSelectorProps {
    /**
     * A map of categoryId -> metadata about the fields in that category,
     * filtered such that the name of every field in the category includes
     * the filter input (as a substring).
     */
    filteredBrowserFields: BrowserFields;
    /**
     * Invoked when the user clicks on the name of a category in the left-hand
     * side of the field browser
     */
    setSelectedCategoryIds: (categoryIds: string[]) => void;
    /** The category selected on the left-hand side of the field browser */
    selectedCategoryIds: string[];
}
export declare const CategoriesSelector: React.NamedExoticComponent<CategoriesSelectorProps>;
export {};
