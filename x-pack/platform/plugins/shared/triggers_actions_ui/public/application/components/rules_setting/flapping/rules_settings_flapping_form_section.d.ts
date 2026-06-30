import React from 'react';
import type { RulesSettingsFlappingProperties } from '@kbn/alerting-plugin/common';
type OnChangeKey = keyof Omit<RulesSettingsFlappingProperties, 'enabled'>;
export declare const RulesSettingsFlappingTitle: () => React.JSX.Element;
export declare const RulesSettingsFlappingDescription: () => React.JSX.Element;
export interface RulesSettingsFlappingFormSectionProps {
    flappingSettings: RulesSettingsFlappingProperties;
    compressed?: boolean;
    onChange: (key: OnChangeKey, value: number) => void;
    canWrite: boolean;
}
export declare const RulesSettingsFlappingFormSection: React.MemoExoticComponent<(props: RulesSettingsFlappingFormSectionProps) => React.JSX.Element>;
export {};
