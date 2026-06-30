import React from 'react';
import type { RuleStatus } from '../../../../types';
export interface RuleStatusFilterProps {
    selectedStatuses: RuleStatus[];
    dataTestSubj?: string;
    selectDataTestSubj?: string;
    buttonDataTestSubj?: string;
    optionDataTestSubj?: (status: RuleStatus) => string;
    onChange: (selectedStatuses: RuleStatus[]) => void;
}
export declare const RuleStatusFilter: (props: RuleStatusFilterProps) => React.JSX.Element;
export { RuleStatusFilter as default };
