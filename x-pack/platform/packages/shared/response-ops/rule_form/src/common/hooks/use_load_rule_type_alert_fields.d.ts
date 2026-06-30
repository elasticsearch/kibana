import type { ActionVariable } from '@kbn/alerting-types';
import type { HttpStart } from '@kbn/core-http-browser';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
export interface UseLoadRuleTypeAlertFieldsProps {
    http: HttpStart;
    ruleTypeId?: string;
    enabled: boolean;
    cacheTime?: number;
    fieldsMetadata?: FieldsMetadataPublicStart;
}
export declare const useLoadRuleTypeAlertFields: (props: UseLoadRuleTypeAlertFieldsProps) => {
    data: ActionVariable[];
    isInitialLoading: boolean;
    isLoading: boolean;
};
