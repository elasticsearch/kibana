import React from 'react';
interface Props {
    onClose: () => void;
    isSaving: boolean;
    isSaved: boolean;
    showButtons: boolean;
    disabled: boolean;
    onClickSave: () => void;
}
export declare const FlyoutFooter: React.NamedExoticComponent<Props>;
export {};
