import React from 'react';
export interface CategoriesBadgesProps {
    setSelectedCategoryIds: (categoryIds: string[]) => void;
    selectedCategoryIds: string[];
}
export declare const CategoriesBadges: React.NamedExoticComponent<CategoriesBadgesProps>;
