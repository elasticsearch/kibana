import type { ActionTypeRegistryContract, RuleTypeRegistryContract } from '@kbn/alerts-ui-shared';
import type { RuleFormData } from '@kbn/response-ops-rule-form';
import type { EsQueryRuleParams } from '@kbn/response-ops-rule-params/es_query';
import type { ChartsPluginSetup } from '@kbn/charts-plugin/public';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
export interface ServiceDependencies {
    coreStart: CoreStart;
    charts: ChartsPluginSetup;
    data: DataPublicPluginStart;
    dataViews: DataViewsPublicPluginStart;
    unifiedSearch: UnifiedSearchPublicPluginStart;
    fieldsMetadata: FieldsMetadataPublicStart;
    contentManagement?: ContentManagementPublicStart;
}
export declare function getRuleFlyoutComponent(startDependencies: ServiceDependencies, ruleTypeRegistry: RuleTypeRegistryContract, actionTypeRegistry: ActionTypeRegistryContract, parentApi: unknown, closeFlyout: () => void, passedInitialValues?: RuleFormData<EsQueryRuleParams>): Promise<JSX.Element>;
