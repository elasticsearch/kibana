import React from 'react';
import type { AlertDeleteCategoryIds } from '@kbn/alerting-plugin/common/constants/alert_delete';
export interface RuleSettingsLinkProps {
    alertDeleteCategoryIds?: AlertDeleteCategoryIds[];
}
export declare const RulesSettingsLink: ({ alertDeleteCategoryIds }: RuleSettingsLinkProps) => React.JSX.Element | null;
export { RulesSettingsLink as default };
