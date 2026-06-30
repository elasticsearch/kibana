import React from 'react';
import type { RuleFormStepId } from '../constants';
import type { RuleFormData, RuleFormState } from '../types';
interface RuleFlyoutBodyProps {
    isEdit?: boolean;
    isSaving?: boolean;
    onCancel: () => void;
    onSave: (formData: RuleFormData) => void;
    onInteraction: () => void;
    onShowRequest: () => void;
    onChangeMetaData?: (metadata?: RuleFormState['metadata']) => void;
    initialStep?: RuleFormStepId;
}
export declare const RuleFlyoutBody: ({ isEdit, isSaving, initialStep, onCancel, onSave, onInteraction, onShowRequest, onChangeMetaData, }: RuleFlyoutBodyProps) => React.JSX.Element;
export {};
