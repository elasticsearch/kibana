import type { RuleFormState } from '../types';
import type { RuleFormStateReducerAction } from './rule_form_state_reducer';
type RuleFormStateWithInteractHandler = RuleFormState & {
    onInteraction: () => void;
};
export declare const RuleFormStateContext: import("react").Context<RuleFormStateWithInteractHandler>;
export declare const RuleFormReducerContext: import("react").Context<import("react").Dispatch<RuleFormStateReducerAction>>;
export {};
