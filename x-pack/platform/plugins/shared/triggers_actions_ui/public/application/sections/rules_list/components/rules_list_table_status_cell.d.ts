import React from 'react';
import type { RuleTableItem } from '../../../../types';
export interface RulesListTableStatusCellProps {
    rule: RuleTableItem;
    onManageLicenseClick: (rule: RuleTableItem) => void;
}
export declare const RulesListTableStatusCell: (props: RulesListTableStatusCellProps) => React.JSX.Element;
