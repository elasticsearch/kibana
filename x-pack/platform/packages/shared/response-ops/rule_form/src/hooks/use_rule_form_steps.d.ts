import type { EuiStepsProps, EuiStepsHorizontalProps } from '@elastic/eui';
import React from 'react';
import { RuleFormStepId } from '../constants';
interface RuleFormVerticalSteps {
    steps: EuiStepsProps['steps'];
}
export declare const useRuleFormSteps: () => RuleFormVerticalSteps;
interface RuleFormHorizontalSteps {
    steps: EuiStepsHorizontalProps['steps'];
    currentStepComponent: React.ReactNode;
    goToNextStep: () => void;
    goToPreviousStep: () => void;
    hasNextStep: boolean;
    hasPreviousStep: boolean;
}
export declare const useRuleFormHorizontalSteps: (initialStep?: RuleFormStepId) => RuleFormHorizontalSteps;
export {};
