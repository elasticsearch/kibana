import React from 'react';
import type { RuleCreationValidConsumer } from '@kbn/rule-data-utils';
export declare const VALID_CONSUMERS: RuleCreationValidConsumer[];
export interface RuleConsumerSelectionProps {
    validConsumers: RuleCreationValidConsumer[];
}
export declare const RuleConsumerSelection: (props: RuleConsumerSelectionProps) => React.JSX.Element;
