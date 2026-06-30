import React from 'react';
export interface BulkOperationPopoverProps {
    numberOfSelectedRules?: number;
    canModifySelectedRules: boolean;
    children: JSX.Element;
}
export declare const BulkOperationPopover: (props: BulkOperationPopoverProps) => React.JSX.Element;
