import React from 'react';
export interface FeatureFilterOption {
    value: string;
    label: string;
}
export interface CreateConnectorFilterProps {
    searchValue: string;
    onSearchValueChange: (value: string) => void;
    selectedFeatureIds: string[];
    onSelectedFeatureIdsChange: (ids: string[]) => void;
    featureOptions: FeatureFilterOption[];
    featureFilterDisabled?: boolean;
}
export declare const CreateConnectorFilter: React.FC<CreateConnectorFilterProps>;
