import React from 'react';
import type { ActionVariable } from '@kbn/alerting-plugin/common';
interface Props {
    messageVariables?: ActionVariable[];
    paramsProperty: string;
    index: number;
    inputTargetValue?: string;
    isDisabled?: boolean;
    editAction: (property: string, value: any, index: number) => void;
    label: string;
    helpText?: string;
    errors?: string[];
    isOptionalField?: boolean;
}
export declare const TextAreaWithMessageVariables: (props: Props) => React.ReactNode;
export {};
