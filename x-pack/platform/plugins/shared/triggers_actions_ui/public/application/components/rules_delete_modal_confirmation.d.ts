import React from 'react';
export declare const RulesDeleteModalConfirmation: ({ confirmButtonText, confirmModalText, onCancel, onConfirm, showWarningText, warningText, }: {
    confirmButtonText: string;
    confirmModalText: string;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
    showWarningText?: boolean;
    warningText?: string;
}) => React.JSX.Element;
