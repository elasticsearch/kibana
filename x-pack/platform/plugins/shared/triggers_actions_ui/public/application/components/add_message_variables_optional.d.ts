import React from 'react';
import type { ActionVariable } from '@kbn/alerting-plugin/common';
interface Props {
    isOptionalField?: boolean;
    messageVariables?: ActionVariable[];
    onSelectEventHandler: (variable: ActionVariable) => void;
    buttonTitle?: string;
    showButtonTitle?: boolean;
    paramsProperty: string;
}
export declare const AddMessageVariablesOptional: React.FunctionComponent<Props>;
export {};
