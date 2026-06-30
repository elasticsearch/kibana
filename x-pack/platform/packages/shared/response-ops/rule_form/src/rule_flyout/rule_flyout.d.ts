import React from 'react';
import type { EuiFlyoutResizableProps } from '@elastic/eui';
import type { RuleFormData, RuleTypeMetaData } from '../types';
import { RuleFormStepId } from '../constants';
interface RuleFlyoutProps {
    isEdit?: boolean;
    isSaving?: boolean;
    onCancel?: () => void;
    onSave: (formData: RuleFormData) => void;
    onChangeMetaData?: (metadata?: RuleTypeMetaData) => void;
    initialEditStep?: RuleFormStepId;
    focusTrapProps?: EuiFlyoutResizableProps['focusTrapProps'];
}
export declare const RuleFlyout: ({ onSave, isEdit, isSaving, onCancel: onClose, onChangeMetaData, initialEditStep, focusTrapProps, }: RuleFlyoutProps) => React.JSX.Element;
export {};
