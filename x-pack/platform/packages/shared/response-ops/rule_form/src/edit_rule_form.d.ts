import React from 'react';
import type { EuiFlyoutResizableProps } from '@elastic/eui';
import type { RuleFormPlugins, RuleTypeMetaData } from './types';
import type { RuleFormStepId } from './constants';
export interface EditRuleFormProps {
    id: string;
    plugins: RuleFormPlugins;
    showMustacheAutocompleteSwitch?: boolean;
    connectorFeatureId?: string;
    isFlyout?: boolean;
    onCancel?: () => void;
    onSubmit?: (ruleId: string) => void;
    onChangeMetaData?: (metadata?: RuleTypeMetaData) => void;
    initialMetadata?: RuleTypeMetaData;
    initialEditStep?: RuleFormStepId;
    focusTrapProps?: EuiFlyoutResizableProps['focusTrapProps'];
}
export declare const EditRuleForm: (props: EditRuleFormProps) => React.JSX.Element;
