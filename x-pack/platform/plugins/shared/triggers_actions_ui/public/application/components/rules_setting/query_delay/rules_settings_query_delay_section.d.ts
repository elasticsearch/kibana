import React from 'react';
import type { RulesSettingsQueryDelayProperties } from '@kbn/alerting-plugin/common';
export declare const RulesSettingsQueryDelayErrorPrompt: React.MemoExoticComponent<() => React.JSX.Element>;
export declare const RulesSettingsQueryDelayTitle: () => React.JSX.Element;
export interface RulesSettingsQueryDelaySectionProps {
    onChange: (key: keyof RulesSettingsQueryDelayProperties, value: number | boolean) => void;
    settings: RulesSettingsQueryDelayProperties;
    canShow: boolean | Readonly<{
        [x: string]: boolean;
    }>;
    canWrite: boolean;
    hasError: boolean;
}
export declare const RulesSettingsQueryDelaySection: React.MemoExoticComponent<(props: RulesSettingsQueryDelaySectionProps) => React.JSX.Element | null>;
