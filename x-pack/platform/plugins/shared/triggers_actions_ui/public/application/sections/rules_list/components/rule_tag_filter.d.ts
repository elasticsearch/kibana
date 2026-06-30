import React from 'react';
import type { EuiSelectableProps } from '@elastic/eui';
export interface RuleTagFilterProps {
    selectedTags: string[];
    isGrouped?: boolean;
    canLoadRules?: boolean;
    refresh?: Date;
    loadingMessage?: EuiSelectableProps['loadingMessage'];
    noMatchesMessage?: EuiSelectableProps['noMatchesMessage'];
    emptyMessage?: EuiSelectableProps['emptyMessage'];
    errorMessage?: EuiSelectableProps['errorMessage'];
    dataTestSubj?: string;
    selectableDataTestSubj?: string;
    optionDataTestSubj?: (tag: string) => string;
    buttonDataTestSubj?: string;
    onChange: (tags: string[]) => void;
}
export declare const RuleTagFilter: React.MemoExoticComponent<(props: RuleTagFilterProps) => React.JSX.Element>;
export { RuleTagFilter as default };
