import type { CoreSetup, CoreStart, Plugin as CorePlugin } from '@kbn/core/public';
import type { ReactElement } from 'react';
import type { PluginInitializerContext } from '@kbn/core/public';
import type { FeaturesPluginStart } from '@kbn/features-plugin/public';
import type { ManagementSetup } from '@kbn/management-plugin/public';
import type { HomePublicPluginSetup } from '@kbn/home-plugin/public';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { PluginStartContract as AlertingStart } from '@kbn/alerting-plugin/public';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { ActionsPublicPluginSetup } from '@kbn/actions-plugin/public';
import type { SecurityPluginSetup, SecurityPluginStart } from '@kbn/security-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { DataViewEditorStart } from '@kbn/data-view-editor-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { ServerlessPluginStart } from '@kbn/serverless/public';
import type { FieldFormatsRegistry } from '@kbn/field-formats-plugin/common';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { RRuleParams, RuleAction, RuleTypeParams } from '@kbn/alerting-plugin/common';
import { TypeRegistry } from '@kbn/alerts-ui-shared/src/common/type_registry';
import type { AlertFormatter } from '@kbn/alerts-ui-shared/src/common/types';
import type { CloudSetup } from '@kbn/cloud-plugin/public';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public';
import type { Start as InspectorStart } from '@kbn/inspector-plugin/public';
import type { Rule } from './types';
import type { AlertsSearchBarProps } from './application/sections/alerts_search_bar';
import type { ExperimentalFeatures } from '../common/experimental_features';
import type { ActionAccordionFormProps } from './application/sections/action_connector_form/action_form';
import type { AlertSummaryWidgetProps } from './application/sections/alert_summary_widget';
import type { RuleStatusPanelProps } from './application/sections/rule_details/components/rule_status_panel';
import type { RuleSnoozeModalProps } from './application/sections/rules_list/components/rule_snooze_modal';
import type { ActionTypeModel, CreateConnectorFlyoutProps, EditConnectorFlyoutProps, GlobalRuleEventLogListProps, RuleDefinitionProps, RuleEventLogListOptions, RuleEventLogListProps, RuleStatusDropdownProps, RuleStatusFilterProps, RuleTagBadgeOptions, RuleTagBadgeProps, RuleTagFilterProps, RuleTypeModel, RulesListNotifyBadgePropsWithApi, RulesListProps } from './types';
import type { RuleSettingsLinkProps } from './application/components/rules_setting/rules_settings_link';
import type { UntrackAlertsModalProps } from './application/sections/common/components/untrack_alerts_modal';
export interface TriggersAndActionsUIPublicPluginSetup {
    actionTypeRegistry: TypeRegistry<ActionTypeModel>;
    ruleTypeRegistry: TypeRegistry<RuleTypeModel<any>>;
}
export interface TriggersAndActionsUIPublicPluginStart {
    actionTypeRegistry: TypeRegistry<ActionTypeModel>;
    ruleTypeRegistry: TypeRegistry<RuleTypeModel<any>>;
    getActionForm: (props: Omit<ActionAccordionFormProps, 'actionTypeRegistry' | 'setActions'> & {
        setActions: (actions: RuleAction[]) => void;
    }) => ReactElement<ActionAccordionFormProps>;
    getAddConnectorFlyout: (props: Omit<CreateConnectorFlyoutProps, 'actionTypeRegistry'>) => ReactElement<CreateConnectorFlyoutProps>;
    getEditConnectorFlyout: (props: Omit<EditConnectorFlyoutProps, 'actionTypeRegistry'>) => ReactElement<EditConnectorFlyoutProps>;
    getAlertsSearchBar: (props: AlertsSearchBarProps) => ReactElement<AlertsSearchBarProps>;
    getRuleStatusDropdown: (props: RuleStatusDropdownProps) => ReactElement<RuleStatusDropdownProps>;
    getRuleTagFilter: (props: RuleTagFilterProps) => ReactElement<RuleTagFilterProps>;
    getRuleStatusFilter: (props: RuleStatusFilterProps) => ReactElement<RuleStatusFilterProps>;
    getRuleTagBadge: <T extends RuleTagBadgeOptions>(props: RuleTagBadgeProps<T>) => ReactElement<RuleTagBadgeProps<T>>;
    getRuleEventLogList: <T extends RuleEventLogListOptions>(props: RuleEventLogListProps<T>) => ReactElement<RuleEventLogListProps<T>>;
    getRulesList: (props: RulesListProps) => ReactElement;
    getRulesListNotifyBadge: (props: RulesListNotifyBadgePropsWithApi) => ReactElement<RulesListNotifyBadgePropsWithApi>;
    getRuleDefinition: (props: RuleDefinitionProps) => ReactElement<RuleDefinitionProps>;
    getRuleStatusPanel: (props: RuleStatusPanelProps) => ReactElement<RuleStatusPanelProps>;
    getAlertSummaryWidget: (props: AlertSummaryWidgetProps) => ReactElement<AlertSummaryWidgetProps>;
    getRuleSnoozeModal: (props: RuleSnoozeModalProps) => ReactElement<RuleSnoozeModalProps>;
    getUntrackModal: (props: UntrackAlertsModalProps) => ReactElement<UntrackAlertsModalProps>;
    getRulesSettingsLink: (props: RuleSettingsLinkProps) => ReactElement<RuleSettingsLinkProps>;
    getRuleHelpers: (rule: Rule<RuleTypeParams>) => {
        isRuleSnoozed: boolean;
        getNextRuleSnoozeSchedule: {
            duration: number;
            rRule: RRuleParams;
            id?: string | undefined;
            skipRecurrences?: string[] | undefined;
        } | null;
    };
    getGlobalRuleEventLogList: (props: GlobalRuleEventLogListProps) => ReactElement<GlobalRuleEventLogListProps>;
    /**
     * Get the alert formatter for a specific rule type.
     * Returns the formatter function if the rule type has one registered, undefined otherwise.
     */
    getAlertFormatter: (ruleTypeId: string) => AlertFormatter | undefined;
}
interface PluginsSetup {
    security: SecurityPluginSetup;
    management: ManagementSetup;
    home?: HomePublicPluginSetup;
    cloud?: CloudSetup;
    actions: ActionsPublicPluginSetup;
    share: SharePluginSetup;
}
interface PluginsStart {
    security: SecurityPluginStart;
    data: DataPublicPluginStart;
    dataViews: DataViewsPublicPluginStart;
    dataViewEditor: DataViewEditorStart;
    charts: ChartsPluginStart;
    alerting?: AlertingStart;
    spaces?: SpacesPluginStart;
    navigateToApp: CoreStart['application']['navigateToApp'];
    features: FeaturesPluginStart;
    expressions: ExpressionsStart;
    unifiedSearch: UnifiedSearchPublicPluginStart;
    licensing: LicensingPluginStart;
    serverless?: ServerlessPluginStart;
    fieldFormats: FieldFormatsRegistry;
    lens: LensPublicStart;
    fieldsMetadata: FieldsMetadataPublicStart;
    uiActions: UiActionsStart;
    contentManagement?: ContentManagementPublicStart;
    share: SharePluginStart;
    cps?: CPSPluginStart;
    inspector?: InspectorStart;
}
export declare class Plugin implements CorePlugin<TriggersAndActionsUIPublicPluginSetup, TriggersAndActionsUIPublicPluginStart, PluginsSetup, PluginsStart> {
    private actionTypeRegistry;
    private ruleTypeRegistry;
    private config;
    private connectorServices?;
    readonly experimentalFeatures: ExperimentalFeatures;
    private readonly isServerless;
    constructor(ctx: PluginInitializerContext);
    setup(core: CoreSetup, plugins: PluginsSetup): TriggersAndActionsUIPublicPluginSetup;
    start(core: CoreStart, plugins: PluginsStart): TriggersAndActionsUIPublicPluginStart;
    stop(): void;
}
export {};
