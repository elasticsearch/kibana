import React from 'react';
import type { ActionTypeModel, ConnectorValidationFunc } from '../../../types';
interface ConnectorFormFieldsProps {
    actionTypeModel: ActionTypeModel | null;
    isEdit: boolean;
    registerPreSubmitValidator: (validator: ConnectorValidationFunc) => void;
    authMode?: 'shared' | 'per-user';
}
export declare const ConnectorFormFields: React.NamedExoticComponent<ConnectorFormFieldsProps>;
export {};
