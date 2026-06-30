import type { EuiFlyoutResizableProps } from '@elastic/eui';
import React from 'react';
import type { RuleFormProps } from '../src/rule_form';
import type { RuleTypeMetaData } from '../src/types';
interface RuleFormFlyoutProps<MetaData extends RuleTypeMetaData> extends RuleFormProps<MetaData> {
    focusTrapProps?: EuiFlyoutResizableProps['focusTrapProps'];
}
export declare const RuleFormFlyout: <MetaData extends RuleTypeMetaData>({ focusTrapProps, ...ruleFormProps }: RuleFormFlyoutProps<MetaData>) => React.JSX.Element;
export {};
