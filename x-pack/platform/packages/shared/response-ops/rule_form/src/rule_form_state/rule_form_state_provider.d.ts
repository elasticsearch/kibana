import React from 'react';
import type { RuleFormState } from '../types';
export interface RuleFormStateProviderProps {
    initialRuleFormState: RuleFormState;
}
export declare const RuleFormStateProvider: React.FC<React.PropsWithChildren<RuleFormStateProviderProps>>;
