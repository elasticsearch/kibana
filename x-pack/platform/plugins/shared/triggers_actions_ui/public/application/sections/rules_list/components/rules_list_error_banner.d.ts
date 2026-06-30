import React from 'react';
interface RulesListErrorBannerProps {
    rulesLastRunOutcomes: Record<string, number>;
    setRuleExecutionStatusesFilter: (statuses: string[]) => void;
    setRuleLastRunOutcomesFilter: (outcomes: string[]) => void;
}
export declare const RulesListErrorBanner: (props: RulesListErrorBannerProps) => React.JSX.Element | null;
export {};
