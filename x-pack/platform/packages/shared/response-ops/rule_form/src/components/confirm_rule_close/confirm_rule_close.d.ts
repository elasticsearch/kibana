import React from 'react';
import type { EuiFlyoutResizableProps } from '@elastic/eui';
export interface ConfirmRuleCloseRuleProps {
    onCancel: () => void;
    onConfirm: () => void;
    focusTrapProps?: EuiFlyoutResizableProps['focusTrapProps'];
}
export declare const ConfirmRuleClose: (props: ConfirmRuleCloseRuleProps) => React.JSX.Element;
