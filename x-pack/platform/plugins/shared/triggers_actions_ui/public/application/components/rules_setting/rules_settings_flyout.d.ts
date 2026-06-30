import React from 'react';
import type { AlertDeleteCategoryIds } from '@kbn/alerting-plugin/common/constants/alert_delete';
export declare const RulesSettingsErrorPrompt: React.MemoExoticComponent<() => React.JSX.Element>;
export interface RulesSettingsFlyoutProps {
    isVisible: boolean;
    setUpdatingRulesSettings?: (isUpdating: boolean) => void;
    onClose: () => void;
    onSave?: () => void;
    alertDeleteCategoryIds?: AlertDeleteCategoryIds[];
}
export declare const RulesSettingsFlyout: React.MemoExoticComponent<(props: RulesSettingsFlyoutProps) => React.JSX.Element | null>;
