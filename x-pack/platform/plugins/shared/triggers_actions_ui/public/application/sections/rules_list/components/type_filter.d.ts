import React from 'react';
export interface TypeFilterProps {
    options: Array<{
        groupName: string;
        subOptions: Array<{
            value: string;
            name: string;
        }>;
    }>;
    onChange: (selectedTags: string[]) => void;
    filters: string[];
}
export declare const TypeFilter: React.FunctionComponent<TypeFilterProps>;
