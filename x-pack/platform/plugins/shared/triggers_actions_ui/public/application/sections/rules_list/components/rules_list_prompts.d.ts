import React from 'react';
interface RulesListPromptsProps {
    showSpinner: boolean;
    showNoAuthPrompt: boolean;
    showCreateFirstRulePrompt: boolean;
    showCreateRuleButtonInPrompt: boolean;
    onCreateRulesClick: () => void;
}
export declare const RulesListPrompts: (props: RulesListPromptsProps) => React.JSX.Element | null;
export {};
