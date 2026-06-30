import React from 'react';
interface Props {
    setRuleParams: (v: {
        investigation_guide: {
            blob: string;
        };
    }) => void;
    value: string;
}
export declare function InvestigationGuideEditor({ setRuleParams, value }: Props): React.JSX.Element;
export {};
