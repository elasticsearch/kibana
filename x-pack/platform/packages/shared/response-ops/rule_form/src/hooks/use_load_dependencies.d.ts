import type { HttpStart } from '@kbn/core-http-browser';
import type { ToastsStart } from '@kbn/core-notifications-browser';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import type { RuleTypeRegistryContract } from '../common/types';
export interface UseLoadDependencies {
    http: HttpStart;
    toasts: ToastsStart;
    ruleTypeRegistry: RuleTypeRegistryContract;
    capabilities: ApplicationStart['capabilities'];
    consumer?: string;
    id?: string;
    ruleTypeId?: string;
    validConsumers?: RuleCreationValidConsumer[];
    filteredRuleTypes?: string[];
    connectorFeatureId?: string;
    fieldsMetadata?: FieldsMetadataPublicStart;
}
export declare const useLoadDependencies: (props: UseLoadDependencies) => {
    isLoading: boolean;
    isInitialLoading: boolean;
    ruleType: import("@kbn/triggers-actions-ui-types").RuleTypeWithDescription | null | undefined;
    ruleTypeModel: import("@kbn/alerts-ui-shared").RuleTypeModel<import("@kbn/alerts-ui-shared").RuleTypeParams> | null;
    ruleTypes: import("@kbn/triggers-actions-ui-types").RuleTypeWithDescription[];
    uiConfig: import("../common/apis").UiConfig | undefined;
    healthCheckError: "alertsError" | "encryptionError" | "apiKeysDisabledError" | "apiKeysAndEncryptionError" | null;
    fetchedFormData: import("../types").RuleFormData<import("@kbn/alerts-ui-shared").RuleTypeParams> | null | undefined;
    flappingSettings: import("@kbn/alerting-types").RulesSettingsFlapping | undefined;
    connectors: import("@kbn/alerts-ui-shared").ActionConnector[];
    connectorTypes: import("@kbn/actions-types").ActionType[];
    alertFields: import("@kbn/alerting-types").ActionVariable[];
};
