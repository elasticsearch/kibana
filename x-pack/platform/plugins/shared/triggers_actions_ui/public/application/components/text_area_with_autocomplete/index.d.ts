import React from 'react';
import type { ActionVariable } from '@kbn/alerting-plugin/common';
export interface TextAreaWithAutocompleteProps {
    editAction: (property: string, value: any, index: number) => void;
    errors?: string[];
    index: number;
    inputTargetValue?: string;
    isDisabled?: boolean;
    label: string;
    messageVariables?: ActionVariable[];
    paramsProperty: string;
}
export declare const TextAreaWithAutocomplete: React.FunctionComponent<TextAreaWithAutocompleteProps>;
export { TextAreaWithAutocomplete as default };
