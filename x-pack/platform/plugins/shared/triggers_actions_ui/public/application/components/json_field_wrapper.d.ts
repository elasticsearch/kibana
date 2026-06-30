import type { FieldHook } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import React from 'react';
import type { ActionVariable } from '@kbn/alerting-plugin/common';
interface Props {
    field: FieldHook<any, string>;
    messageVariables?: ActionVariable[];
    paramsProperty: string;
    euiCodeEditorProps?: {
        [key: string]: any;
    };
    [key: string]: any;
}
export declare const JsonFieldWrapper: ({ field, ...rest }: Props) => React.JSX.Element;
export {};
