import React from 'react';
import type { EuiFlyoutResizableProps } from '@elastic/eui';
import { type RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import type { RuleFormData, RuleFormPlugins, RuleTypeMetaData } from './types';
export interface CreateRuleFormProps {
    ruleTypeId: string;
    plugins: RuleFormPlugins;
    consumer?: string;
    connectorFeatureId?: string;
    multiConsumerSelection?: RuleCreationValidConsumer | null;
    hideInterval?: boolean;
    validConsumers?: RuleCreationValidConsumer[];
    filteredRuleTypes?: string[];
    shouldUseRuleProducer?: boolean;
    canShowConsumerSelection?: boolean;
    showMustacheAutocompleteSwitch?: boolean;
    isFlyout?: boolean;
    onCancel?: () => void;
    onSubmit?: (ruleId: string) => void;
    onChangeMetaData?: (metadata?: RuleTypeMetaData) => void;
    initialValues?: Partial<RuleFormData>;
    initialMetadata?: RuleTypeMetaData;
    focusTrapProps?: EuiFlyoutResizableProps['focusTrapProps'];
}
export declare const CreateRuleForm: (props: CreateRuleFormProps) => React.JSX.Element;
