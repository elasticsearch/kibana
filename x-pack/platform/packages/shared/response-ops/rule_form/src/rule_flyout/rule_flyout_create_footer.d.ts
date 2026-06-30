import React from 'react';
export interface RuleFlyoutCreateFooterProps {
    isSaving: boolean;
    hasErrors: boolean;
    onCancel: () => void;
    onSave: () => void;
    onShowRequest: () => void;
    hasNextStep: boolean;
    hasPreviousStep: boolean;
    goToNextStep: () => void;
    goToPreviousStep: () => void;
}
export declare const RuleFlyoutCreateFooter: ({ onCancel, onSave, onShowRequest, hasErrors, isSaving, hasNextStep, hasPreviousStep, goToNextStep, goToPreviousStep, }: RuleFlyoutCreateFooterProps) => React.JSX.Element;
