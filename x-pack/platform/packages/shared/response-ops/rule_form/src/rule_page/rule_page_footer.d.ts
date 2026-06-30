import React from 'react';
export interface RulePageFooterProps {
    isEdit?: boolean;
    isSaving?: boolean;
    onCancel: () => void;
    onSave: () => void;
}
export declare const RulePageFooter: (props: RulePageFooterProps) => React.JSX.Element;
