import React from 'react';
export interface RuleQueryInspectorProps {
    ruleId: string;
    ruleTypeId: string;
    alertId?: string;
}
export declare function RuleQueryInspector({ ruleId, ruleTypeId, alertId }: RuleQueryInspectorProps): React.JSX.Element | null;
