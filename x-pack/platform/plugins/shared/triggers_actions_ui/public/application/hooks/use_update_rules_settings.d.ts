import type { RulesSettingsProperties } from '@kbn/alerting-plugin/common';
interface UseUpdateRuleSettingsProps {
    onClose: () => void;
    onSave?: () => void;
    setUpdatingRulesSettings?: (isUpdating: boolean) => void;
}
export declare const useUpdateRuleSettings: (props: UseUpdateRuleSettingsProps) => import("@kbn/react-query").UseMutationResult<((import("@kbn/alerting-types/rule_settings").RulesSettingsFlappingProperties & import("@kbn/alerting-types/rule_settings").RulesSettingsModificationMetadata) | (import("@kbn/alerting-types/rule_settings").RulesSettingsQueryDelayProperties & import("@kbn/alerting-types/rule_settings").RulesSettingsModificationMetadata))[], unknown, RulesSettingsProperties, void>;
export {};
