import type { EuiFlyoutResizableProps } from '@elastic/eui';
import React from 'react';
import { type RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import type { RuleFormData, RuleFormPlugins, RuleTypeMetaData } from './types';
import type { RuleFormStepId } from './constants';
export interface RuleFormProps<MetaData extends RuleTypeMetaData = RuleTypeMetaData> {
    plugins: RuleFormPlugins;
    id?: string;
    ruleTypeId?: string;
    isFlyout?: boolean;
    onCancel?: () => void;
    onSubmit?: (ruleId: string) => void;
    onChangeMetaData?: (metadata: MetaData) => void;
    consumer?: string;
    connectorFeatureId?: string;
    multiConsumerSelection?: RuleCreationValidConsumer | null;
    hideInterval?: boolean;
    validConsumers?: RuleCreationValidConsumer[];
    filteredRuleTypes?: string[];
    shouldUseRuleProducer?: boolean;
    canShowConsumerSelection?: boolean;
    showMustacheAutocompleteSwitch?: boolean;
    initialValues?: Partial<Omit<RuleFormData, 'ruleTypeId'>>;
    initialMetadata?: MetaData;
    initialEditStep?: RuleFormStepId;
    focusTrapProps?: EuiFlyoutResizableProps['focusTrapProps'];
}
export declare const RuleForm: <MetaData extends RuleTypeMetaData = RuleTypeMetaData>(props: RuleFormProps<MetaData>) => React.JSX.Element;
