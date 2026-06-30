import React from 'react';
import type { EuiStepHorizontalProps } from '@elastic/eui/src/components/steps/step_horizontal';
interface RuleFlyoutEditTabsProps {
    steps: Array<Omit<EuiStepHorizontalProps, 'step'>>;
}
export declare const RuleFlyoutEditTabs: ({ steps }: RuleFlyoutEditTabsProps) => React.JSX.Element;
export {};
