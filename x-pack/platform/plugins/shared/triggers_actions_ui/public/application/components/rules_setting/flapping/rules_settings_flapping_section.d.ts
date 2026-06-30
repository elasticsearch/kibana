import React from 'react';
import type { RulesSettingsFlappingProperties } from '@kbn/alerting-plugin/common';
import type { EuiSwitchProps } from '@elastic/eui';
import type { RulesSettingsFlappingFormSectionProps } from './rules_settings_flapping_form_section';
export declare const RulesSettingsFlappingErrorPrompt: React.MemoExoticComponent<() => React.JSX.Element>;
interface RulesSettingsFlappingFormLeftProps {
    settings: RulesSettingsFlappingProperties;
    onChange: EuiSwitchProps['onChange'];
    isSwitchDisabled: boolean;
}
export declare const RulesSettingsFlappingFormLeft: React.MemoExoticComponent<(props: RulesSettingsFlappingFormLeftProps) => React.JSX.Element>;
interface RulesSettingsFlappingFormRightProps {
    settings: RulesSettingsFlappingProperties;
    onChange: RulesSettingsFlappingFormSectionProps['onChange'];
    canWrite: boolean;
}
export declare const RulesSettingsFlappingFormRight: React.MemoExoticComponent<(props: RulesSettingsFlappingFormRightProps) => React.JSX.Element | null>;
export interface RulesSettingsFlappingSectionProps {
    onChange: (key: keyof RulesSettingsFlappingProperties, value: number | boolean) => void;
    settings: RulesSettingsFlappingProperties;
    canShow: boolean | Readonly<{
        [x: string]: boolean;
    }>;
    canWrite: boolean;
    hasError: boolean;
}
export declare const RulesSettingsFlappingSection: React.MemoExoticComponent<(props: RulesSettingsFlappingSectionProps) => React.JSX.Element | null>;
export {};
