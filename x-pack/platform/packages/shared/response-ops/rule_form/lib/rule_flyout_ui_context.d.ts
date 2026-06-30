import React from 'react';
export declare const RuleFlyoutUIContext: React.Context<{
    onClickClose: (() => void) | null;
    hideCloseButton: boolean;
    setOnClickClose: (onClickClose: () => void) => void;
    setHideCloseButton: (hideCloseButton: boolean) => void;
}>;
export declare const RuleFlyoutUIContextProvider: React.FC<React.PropsWithChildren>;
export declare const useRuleFlyoutUIContext: () => {
    onClickClose: (() => void) | null;
    hideCloseButton: boolean;
    setOnClickClose: (onClickClose: () => void) => void;
    setHideCloseButton: (hideCloseButton: boolean) => void;
};
