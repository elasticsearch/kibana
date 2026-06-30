import React from 'react';
import type { RuleFormData } from '../types';
export interface RulePageProps {
    isEdit?: boolean;
    isSaving?: boolean;
    onCancel?: () => void;
    onSave: (formData: RuleFormData) => void;
}
export declare const RulePage: (props: RulePageProps) => React.JSX.Element;
