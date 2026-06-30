import React from 'react';
import type { ActionVariable } from '@kbn/alerting-plugin/common';
interface Props {
    buttonTitle?: string;
    messageVariables?: ActionVariable[];
    paramsProperty: string;
    inputTargetValue?: string | null;
    label: React.ReactNode | string;
    errors?: string[];
    ariaLabel?: string;
    onDocumentsChange: (data: string) => void;
    helpText?: JSX.Element;
    onBlur?: () => void;
    showButtonTitle?: boolean;
    dataTestSubj?: string;
    euiCodeEditorProps?: {
        [key: string]: any;
    };
    isOptionalField?: boolean;
    readOnly?: boolean;
}
export declare const JsonEditorWithMessageVariables: React.FunctionComponent<Props>;
export {};
