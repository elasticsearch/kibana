import React from 'react';
import type { FormHook } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import type { ConnectorFormSchema } from '@kbn/alerts-ui-shared';
import type { ActionTypeModel, ConnectorValidationFunc } from '../../../types';
export interface ConnectorFormState {
    isValid: boolean | undefined;
    isSubmitted: boolean;
    isSubmitting: boolean;
    submit: FormHook<ConnectorFormSchema>['submit'];
    preSubmitValidator: ConnectorValidationFunc | null;
}
export type ResetForm = (options?: {
    resetValues?: boolean | undefined;
    defaultValue?: Partial<ConnectorFormSchema<Record<string, unknown>, Record<string, unknown>>> | undefined;
} | undefined) => void;
interface Props {
    actionTypeModel: ActionTypeModel | null;
    connector: ConnectorFormSchema & {
        isMissingSecrets: boolean;
    };
    isEdit: boolean;
    /** Handler to receive state changes updates */
    onChange?: (state: ConnectorFormState) => void;
    /** Handler to receive update on the form "isModified" state */
    onFormModifiedChange?: (isModified: boolean) => void;
    setResetForm?: (value: ResetForm) => void;
}
export declare const ConnectorForm: React.NamedExoticComponent<Props>;
export {};
