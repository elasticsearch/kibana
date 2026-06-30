import React from 'react';
import type { ActionVariable } from '@kbn/alerting-plugin/common';
interface Props {
    buttonTitle?: string;
    messageVariables?: ActionVariable[];
    paramsProperty: string;
    index: number;
    inputTargetValue?: string;
    editAction: (property: string, value: any, index: number) => void;
    errors?: string[];
    defaultValue?: string | number | string[];
    wrapField?: boolean;
    formRowProps?: {
        describedByIds?: string[];
        error: string | null;
        fullWidth: boolean;
        helpText: React.ReactNode;
        isInvalid: boolean;
        label?: string;
    };
    showButtonTitle?: boolean;
    'aria-label'?: string;
}
export declare const TextFieldWithMessageVariables: React.FunctionComponent<Props>;
export {};
