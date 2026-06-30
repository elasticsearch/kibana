import type { ReactNode } from 'react';
import React from 'react';
import type { ValidationConfig } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { FIELD_TYPES } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
type Validations<T = any> = Array<ValidationConfig<FormData, string, T>>;
export interface CommonFieldSchema<T = any> {
    id: string;
    label: string;
    labelAppend?: ReactNode;
    helpText?: string | ReactNode;
    isRequired?: boolean;
    type?: keyof typeof FIELD_TYPES;
    euiFieldProps?: Record<string, unknown>;
    validations?: Validations<T>;
}
export interface ConfigFieldSchema<T = any> extends CommonFieldSchema<T> {
    isUrlField?: boolean;
    requireTld?: boolean;
    defaultValue?: T;
}
export interface SecretsFieldSchema extends CommonFieldSchema {
    isPasswordField?: boolean;
}
interface SimpleConnectorFormProps {
    isEdit: boolean;
    readOnly: boolean;
    configFormSchema: ConfigFieldSchema[];
    secretsFormSchema: SecretsFieldSchema[];
}
export declare const SimpleConnectorForm: React.NamedExoticComponent<SimpleConnectorFormProps>;
export {};
