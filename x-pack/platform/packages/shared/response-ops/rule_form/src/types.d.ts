import type { ActionType } from '@kbn/actions-types';
import type { ActionVariable, RulesSettingsFlapping } from '@kbn/alerting-types';
import type { ChartsPluginSetup } from '@kbn/charts-plugin/public';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { DocLinksStart } from '@kbn/core-doc-links-browser';
import type { HttpStart } from '@kbn/core-http-browser';
import type { I18nStart } from '@kbn/core-i18n-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { ThemeServiceStart } from '@kbn/core-theme-browser';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { ActionConnector, ActionTypeRegistryContract } from '@kbn/alerts-ui-shared';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { MinimumScheduleInterval, Rule, RuleFormActionsErrors, RuleFormBaseErrors, RuleFormParamsErrors, RuleTypeMetaData, RuleTypeModel, RuleTypeParams, RuleTypeRegistryContract, RuleTypeWithDescription, RuleUiAction } from './common/types';
export type * from './common/types';
export interface RuleFormData<Params extends RuleTypeParams = RuleTypeParams> {
    name: Rule<Params>['name'];
    tags: Rule<Params>['tags'];
    params: Rule<Params>['params'];
    schedule: Rule<Params>['schedule'];
    consumer: Rule<Params>['consumer'];
    actions: RuleUiAction[];
    alertDelay?: Rule<Params>['alertDelay'];
    notifyWhen?: Rule<Params>['notifyWhen'];
    throttle?: Rule<Params>['throttle'];
    ruleTypeId?: Rule<Params>['ruleTypeId'];
    flapping?: Rule<Params>['flapping'];
    artifacts?: Rule<Params>['artifacts'];
}
export interface RuleFormPlugins {
    http: HttpStart;
    i18n: I18nStart;
    theme: ThemeServiceStart;
    userProfile: UserProfileService;
    application: ApplicationStart;
    notifications: NotificationsStart;
    charts: ChartsPluginSetup;
    settings: SettingsStart;
    data: DataPublicPluginStart;
    dataViews: DataViewsPublicPluginStart;
    unifiedSearch: UnifiedSearchPublicPluginStart;
    docLinks: DocLinksStart;
    ruleTypeRegistry: RuleTypeRegistryContract;
    actionTypeRegistry: ActionTypeRegistryContract;
    fieldsMetadata: FieldsMetadataPublicStart;
    contentManagement?: ContentManagementPublicStart;
    uiActions?: UiActionsStart;
}
export interface RuleFormState<Params extends RuleTypeParams = RuleTypeParams, MetaData = RuleTypeMetaData> {
    id?: string;
    formData: RuleFormData<Params>;
    plugins: RuleFormPlugins;
    connectors: ActionConnector[];
    connectorTypes: ActionType[];
    alertFields: ActionVariable[];
    availableRuleTypes: RuleTypeWithDescription[];
    baseErrors?: RuleFormBaseErrors;
    paramsErrors?: RuleFormParamsErrors;
    actionsErrors?: Record<string, RuleFormActionsErrors>;
    actionsParamsErrors?: Record<string, RuleFormParamsErrors>;
    selectedRuleType: RuleTypeWithDescription;
    selectedRuleTypeModel: RuleTypeModel<Params>;
    multiConsumerSelection?: RuleCreationValidConsumer | null;
    showMustacheAutocompleteSwitch?: boolean;
    metadata?: MetaData;
    minimumScheduleInterval?: MinimumScheduleInterval;
    canShowConsumerSelection?: boolean;
    validConsumers: RuleCreationValidConsumer[];
    flappingSettings?: RulesSettingsFlapping;
    touched?: boolean;
}
export type InitialRule = Partial<Rule> & Pick<Rule, 'params' | 'consumer' | 'schedule' | 'actions' | 'tags'>;
export type { SanitizedRuleAction as RuleAction } from '@kbn/alerting-types';
export interface ValidationResult {
    errors: Record<string, any>;
}
export type RuleDashboardsPlugins = Pick<RuleFormPlugins, 'uiActions'>;
export type ShowRequestActivePage = 'create' | 'update';
