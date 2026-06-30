import React from 'react';
import type { EuiSelectableOption } from '@elastic/eui';
interface Props {
    options: EuiSelectableOption[];
    onOptionsChange: (options: EuiSelectableOption[]) => void;
}
export declare const PercentileSelectablePopover: React.MemoExoticComponent<(props: Props) => React.JSX.Element>;
export {};
