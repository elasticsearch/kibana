import React from 'react';
interface RulesListStatusesProps {
    rulesStatuses: Record<string, number>;
    rulesLastRunOutcomes: Record<string, number>;
}
export declare const RulesListStatuses: (props: RulesListStatusesProps) => React.JSX.Element;
export {};
