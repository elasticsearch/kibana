import React from 'react';
export interface FieldTableHeaderProps {
    fieldCount: number;
    filterSelectedEnabled: boolean;
    onFilterSelectedChange: (enabled: boolean) => void;
}
export declare const FieldTableHeader: React.NamedExoticComponent<FieldTableHeaderProps>;
