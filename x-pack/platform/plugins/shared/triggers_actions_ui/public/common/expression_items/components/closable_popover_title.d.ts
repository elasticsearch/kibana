import React from 'react';
interface ClosablePopoverTitleProps {
    children: JSX.Element;
    onClose: () => void;
    dataTestSubj?: string;
}
export declare const ClosablePopoverTitle: ({ children, onClose, dataTestSubj, }: ClosablePopoverTitleProps) => React.JSX.Element;
export {};
