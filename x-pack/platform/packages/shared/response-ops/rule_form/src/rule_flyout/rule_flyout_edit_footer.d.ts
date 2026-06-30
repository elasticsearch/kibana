import React from 'react';
export interface RuleFlyoutEditFooterProps {
    isSaving: boolean;
    hasErrors: boolean;
    onCancel: () => void;
    onSave: () => void;
    onShowRequest: () => void;
}
export declare const RuleFlyoutEditFooter: ({ onCancel, onSave, onShowRequest, hasErrors, isSaving, }: RuleFlyoutEditFooterProps) => React.JSX.Element;
