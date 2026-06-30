/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AppMountParameters,
  CoreSetup,
  CoreStart,
  Plugin as CorePlugin,
} from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';

import { i18n } from '@kbn/i18n';
import type { ReactElement } from 'react';
import type { PluginInitializerContext } from '@kbn/core/public';
import type { FeaturesPluginStart } from '@kbn/features-plugin/public';
import type { KibanaFeature } from '@kbn/features-plugin/common';
import type { ManagementAppMountParams, ManagementSetup } from '@kbn/management-plugin/public';
import type { HomePublicPluginSetup } from '@kbn/home-plugin/public';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { PluginStartContract as AlertingStart } from '@kbn/alerting-plugin/public';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { ActionsPublicPluginSetup } from '@kbn/actions-plugin/public';
import type { SecurityPluginSetup, SecurityPluginStart } from '@kbn/security-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { DataViewEditorStart } from '@kbn/data-view-editor-plugin/public';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import { triggersActionsRoute } from '@kbn/rule-data-utils';
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
import { ON_OPEN_PANEL_MENU, ALERT_RULE_TRIGGER } from '@kbn/ui-actions-plugin/common/trigger_ids';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public';
import type { Start as InspectorStart } from '@kbn/inspector-plugin/public';
import { RuleDetailsLocatorDefinition } from './locators/rule_details';
import { RulesLocatorDefinition } from './locators/rules';
import type { Rule, RuleUiAction } from './types';
import type { AlertsSearchBarProps } from './application/sections/alerts_search_bar';

import { getAddConnectorFlyoutLazy } from './common/get_add_connector_flyout';
import { getAddConnectorFormLazy } from './common/get_add_connector_form';
import type { CreateConnectorFormProps } from './application/sections/action_connector_form';
import { getEditConnectorFlyoutLazy } from './common/get_edit_connector_flyout';
import { getRuleEventLogListLazy } from './common/get_rule_event_log_list';
import { getRuleStatusDropdownLazy } from './common/get_rule_status_dropdown';
import { getRuleStatusFilterLazy } from './common/get_rule_status_filter';
import { getRuleTagBadgeLazy } from './common/get_rule_tag_badge';
import { getRuleTagFilterLazy } from './common/get_rule_tag_filter';
import { getRulesListLazy } from './common/get_rules_list';
import { getActionFormLazy } from './common/get_action_form';
import { getRuleStatusPanelLazy } from './common/get_rule_status_panel';
import { ExperimentalFeaturesService } from './common/experimental_features_service';
import type { ExperimentalFeatures } from '../common/experimental_features';
import { parseExperimentalConfigValue } from '../common/experimental_features';
import { getRulesListNotifyBadgeLazy } from './common/get_rules_list_notify_badge';
import type { TriggersActionsUiConfigType } from '../common/types';
import type { ActionAccordionFormProps } from './application/sections/action_connector_form/action_form';
import type { AlertSummaryWidgetProps } from './application/sections/alert_summary_widget';
import type { AlertSummaryWidgetDependencies } from './application/sections/alert_summary_widget/types';
import type { RuleStatusPanelProps } from './application/sections/rule_details/components/rule_status_panel';
import type { RuleSnoozeModalProps } from './application/sections/rules_list/components/rule_snooze_modal';

import { ALERTS_PAGE_ID, CONNECTORS_PLUGIN_ID, PLUGIN_ID } from './common/constants';
import { getAlertsSearchBarLazy } from './common/get_alerts_search_bar';
import { getGlobalRuleEventLogListLazy } from './common/get_global_rule_event_log_list';
import { getAlertSummaryWidgetLazy } from './common/get_rule_alerts_summary';
import { getRuleDefinitionLazy } from './common/get_rule_definition';
import { getRuleSnoozeModalLazy } from './common/get_rule_snooze_modal';
import { getRulesSettingsLinkLazy } from './common/get_rules_settings_link';
import { AlertRuleFromVisAction } from './common/alert_rule_from_vis_ui_action';

import type {
  ActionTypeModel,
  ConnectorServices,
  CreateConnectorFlyoutProps,
  EditConnectorFlyoutProps,
  GlobalRuleEventLogListProps,
  RuleDefinitionProps,
  RuleEventLogListOptions,
  RuleEventLogListProps,
  RuleStatusDropdownProps,
  RuleStatusFilterProps,
  RuleTagBadgeOptions,
  RuleTagBadgeProps,
  RuleTagFilterProps,
  RuleTypeModel,
  RulesListNotifyBadgePropsWithApi,
  RulesListProps,
} from './types';
import type { RuleSettingsLinkProps } from './application/components/rules_setting/rules_settings_link';
import type { UntrackAlertsModalProps } from './application/sections/common/components/untrack_alerts_modal';
import { isRuleSnoozed } from './application/lib';
import { getNextRuleSnoozeSchedule } from './application/sections/rules_list/components/notify_badge/helpers';
import { getUntrackModalLazy } from './common/get_untrack_modal';

export interface TriggersAndActionsUIPublicPluginSetup {
  actionTypeRegistry: TypeRegistry<ActionTypeModel>;
  ruleTypeRegistry: TypeRegistry<RuleTypeModel<any>>;
}

export interface TriggersAndActionsUIPublicPluginStart {
  actionTypeRegistry: TypeRegistry<ActionTypeModel>;
  ruleTypeRegistry: TypeRegistry<RuleTypeModel<any>>;
  getActionForm: (
    props: Omit<ActionAccordionFormProps, 'actionTypeRegistry' | 'setActions'> & {
      setActions: (actions: RuleAction[]) => void;
    }
  ) => ReactElement<ActionAccordionFormProps>;
  getAddConnectorFlyout: (
    props: Omit<CreateConnectorFlyoutProps, 'actionTypeRegistry'>
  ) => ReactElement<CreateConnectorFlyoutProps>;
  getAddConnectorForm: (
    props: Omit<CreateConnectorFormProps, 'actionTypeRegistry'>
  ) => ReactElement;
  getEditConnectorFlyout: (
    props: Omit<EditConnectorFlyoutProps, 'actionTypeRegistry'>
  ) => ReactElement<EditConnectorFlyoutProps>;
  getAlertsSearchBar: (props: AlertsSearchBarProps) => ReactElement<AlertsSearchBarProps>;
  getRuleStatusDropdown: (props: RuleStatusDropdownProps) => ReactElement<RuleStatusDropdownProps>;
  getRuleTagFilter: (props: RuleTagFilterProps) => ReactElement<RuleTagFilterProps>;
  getRuleStatusFilter: (props: RuleStatusFilterProps) => ReactElement<RuleStatusFilterProps>;
  getRuleTagBadge: <T extends RuleTagBadgeOptions>(
    props: RuleTagBadgeProps<T>
  ) => ReactElement<RuleTagBadgeProps<T>>;
  getRuleEventLogList: <T extends RuleEventLogListOptions>(
    props: RuleEventLogListProps<T>
  ) => ReactElement<RuleEventLogListProps<T>>;
  getRulesList: (props: RulesListProps) => ReactElement;
  getRulesListNotifyBadge: (
    props: RulesListNotifyBadgePropsWithApi
  ) => ReactElement<RulesListNotifyBadgePropsWithApi>;
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
  getGlobalRuleEventLogList: (
    props: GlobalRuleEventLogListProps
  ) => ReactElement<GlobalRuleEventLogListProps>;
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

export class Plugin
  implements
    CorePlugin<
      TriggersAndActionsUIPublicPluginSetup,
      TriggersAndActionsUIPublicPluginStart,
      PluginsSetup,
      PluginsStart
    >
{
  private actionTypeRegistry: TypeRegistry<ActionTypeModel>;
  private ruleTypeRegistry: TypeRegistry<RuleTypeModel>;
  private config: TriggersActionsUiConfigType;
  private connectorServices?: ConnectorServices;
  readonly experimentalFeatures: ExperimentalFeatures;
  private readonly isServerless: boolean;

  constructor(ctx: PluginInitializerContext) {
    this.actionTypeRegistry = new TypeRegistry<ActionTypeModel>();
    this.ruleTypeRegistry = new TypeRegistry<RuleTypeModel>();
    this.config = ctx.config.get();
    this.experimentalFeatures = parseExperimentalConfigValue(this.config.enableExperimental || []);
    this.isServerless = ctx.env.packageInfo.buildFlavor === 'serverless';
  }

  public setup(core: CoreSetup, plugins: PluginsSetup): TriggersAndActionsUIPublicPluginSetup {
    const actionTypeRegistry = this.actionTypeRegistry;
    const ruleTypeRegistry = this.ruleTypeRegistry;
    const isServerless = this.isServerless;
    this.connectorServices = {
      validateEmailAddresses: plugins.actions.validateEmailAddresses,
      enabledEmailServices: plugins.actions.enabledEmailServices,
      isWebhookSslWithPfxEnabled: plugins.actions.isWebhookSslWithPfxEnabled,
    };

    ExperimentalFeaturesService.init({ experimentalFeatures: this.experimentalFeatures });

    plugins.share.url.locators.create(new RulesLocatorDefinition());
    plugins.share.url.locators.create(new RuleDetailsLocatorDefinition());

    const featureTitle = i18n.translate('xpack.triggersActionsUI.managementSection.displayName', {
      defaultMessage: 'Rules',
    });
    const featureDescription = i18n.translate(
      'xpack.triggersActionsUI.managementSection.displayDescription',
      {
        defaultMessage: 'Detect conditions using rules.',
      }
    );
    const alertsFeatureTitle = i18n.translate(
      'xpack.triggersActionsUI.managementSection.alerts.displayName',
      {
        defaultMessage: 'Alerts',
      }
    );
    const alertsFeatureDescription = i18n.translate(
      'xpack.triggersActionsUI.managementSection.alerts.displayDescription',
      {
        defaultMessage: 'Monitor all of your alerts in one place',
      }
    );
    const connectorsFeatureTitle = i18n.translate(
      'xpack.triggersActionsUI.managementSection.connectors.displayName',
      {
        defaultMessage: 'Connectors',
      }
    );
    const connectorsFeatureDescription = i18n.translate(
      'xpack.triggersActionsUI.managementSection.connectors.displayDescription',
      {
        defaultMessage: 'Connect third-party software with your alerting data.',
      }
    );

    if (plugins.home) {
      plugins.home.featureCatalogue.register({
        id: PLUGIN_ID,
        title: featureTitle,
        description: featureDescription,
        icon: 'watchesApp',
        path: triggersActionsRoute,
        showOnHomePage: false,
        category: 'admin',
      });
      plugins.home.featureCatalogue.register({
        id: CONNECTORS_PLUGIN_ID,
        title: connectorsFeatureTitle,
        description: connectorsFeatureDescription,
        icon: 'watchesApp',
        path: triggersActionsRoute,
        showOnHomePage: false,
        category: 'admin',
      });
    }

    if (this.config.rules.enabled) {
      core.application.register({
        id: 'rules',
        appRoute: '/app/rules',
        title: i18n.translate('xpack.triggersActionsUI.rulesPage.title', {
          defaultMessage: 'Rules',
        }),
        visibleIn: ['globalSearch', 'projectSideNav'],
        category: DEFAULT_APP_CATEGORIES.management,
        async mount(params: AppMountParameters) {
          const [coreStart] = (await core.getStartServices()) as [CoreStart, PluginsStart, unknown];
          const { pathname, search, hash } = params.history.location;
          await coreStart.application.navigateToApp('management', {
            path: `/insightsAndAlerting/${PLUGIN_ID}${pathname}${search}${hash}`,
            replace: true,
          });
          return () => {};
        },
      });

      plugins.management.sections.section.insightsAndAlerting.registerApp({
        id: PLUGIN_ID,
        title: featureTitle,
        order: 1,
        async mount(params: ManagementAppMountParams) {
          const [coreStart, pluginsStart] = (await core.getStartServices()) as [
            CoreStart,
            PluginsStart,
            unknown
          ];

          const { renderRulesPageApp } = await import('./application/rules_page_app');

          // The `/api/features` endpoint requires the "Global All" Kibana privilege. Users with a
          // subset of this privilege are not authorized to access this endpoint and will receive a 404
          // error that causes the Alerting view to fail to load.
          let kibanaFeatures: KibanaFeature[];
          try {
            kibanaFeatures = await pluginsStart.features.getFeatures();
          } catch (err) {
            kibanaFeatures = [];
          }

          return renderRulesPageApp({
            ...coreStart,
            actions: plugins.actions,
            security: pluginsStart.security,
            cloud: plugins.cloud,
            data: pluginsStart.data,
            dataViews: pluginsStart.dataViews,
            dataViewEditor: pluginsStart.dataViewEditor,
            charts: pluginsStart.charts,
            alerting: pluginsStart.alerting,
            spaces: pluginsStart.spaces,
            unifiedSearch: pluginsStart.unifiedSearch,
            isCloud: Boolean(plugins.cloud?.isCloudEnabled),
            element: params.element,
            theme: coreStart.theme,
            storage: new Storage(window.localStorage),
            setBreadcrumbs: params.setBreadcrumbs,
            history: params.history,
            actionTypeRegistry,
            ruleTypeRegistry,
            kibanaFeatures,
            licensing: pluginsStart.licensing,
            expressions: pluginsStart.expressions,
            isServerless,
            fieldFormats: pluginsStart.fieldFormats,
            lens: pluginsStart.lens,
            fieldsMetadata: pluginsStart.fieldsMetadata,
            contentManagement: pluginsStart.contentManagement,
            share: pluginsStart.share,
            uiActions: pluginsStart.uiActions,
            cps: pluginsStart.cps,
            inspector: pluginsStart.inspector,
          });
        },
      });
    }

    plugins.management.sections.section.insightsAndAlerting.registerApp({
      id: CONNECTORS_PLUGIN_ID,
      title: connectorsFeatureTitle,
      order: 2,
      async mount(params: ManagementAppMountParams) {
        const [coreStart, pluginsStart] = (await core.getStartServices()) as [
          CoreStart,
          PluginsStart,
          unknown
        ];

        const { renderApp } = await import('./application/connectors_app');

        // The `/api/features` endpoint requires the "Global All" Kibana privilege. Users with a
        // subset of this privilege are not authorized to access this endpoint and will receive a 404
        // error that causes the Alerting view to fail to load.
        let kibanaFeatures: KibanaFeature[];
        try {
          kibanaFeatures = await pluginsStart.features.getFeatures();
        } catch (err) {
          kibanaFeatures = [];
        }

        return renderApp({
          ...coreStart,
          actions: plugins.actions,
          data: pluginsStart.data,
          dataViews: pluginsStart.dataViews,
          dataViewEditor: pluginsStart.dataViewEditor,
          charts: pluginsStart.charts,
          alerting: pluginsStart.alerting,
          spaces: pluginsStart.spaces,
          unifiedSearch: pluginsStart.unifiedSearch,
          isCloud: Boolean(plugins.cloud?.isCloudEnabled),
          element: params.element,
          theme$: params.theme$,
          storage: new Storage(window.localStorage),
          setBreadcrumbs: params.setBreadcrumbs,
          history: params.history,
          actionTypeRegistry,
          ruleTypeRegistry,
          share: pluginsStart.share,
          kibanaFeatures,
          isServerless,
          uiActions: pluginsStart.uiActions,
        });
      },
    });

    if (this.experimentalFeatures.stackAlertsPage) {
      plugins.management.sections.section.insightsAndAlerting.registerApp({
        id: ALERTS_PAGE_ID,
        title: alertsFeatureTitle,
        capabilitiesId: PLUGIN_ID,
        order: 0,
        async mount(params: ManagementAppMountParams) {
          const { renderApp } = await import('./application/alerts_app');
          const [coreStart, pluginsStart] = (await core.getStartServices()) as [
            CoreStart,
            PluginsStart,
            unknown
          ];
          let kibanaFeatures: KibanaFeature[];
          try {
            kibanaFeatures = await pluginsStart.features.getFeatures();
          } catch (err) {
            kibanaFeatures = [];
          }

          return renderApp({
            ...coreStart,
            actions: plugins.actions,
            security: pluginsStart.security,
            data: pluginsStart.data,
            dataViews: pluginsStart.dataViews,
            dataViewEditor: pluginsStart.dataViewEditor,
            charts: pluginsStart.charts,
            alerting: pluginsStart.alerting,
            spaces: pluginsStart.spaces,
            unifiedSearch: pluginsStart.unifiedSearch,
            isCloud: Boolean(plugins.cloud?.isCloudEnabled),
            element: params.element,
            theme: params.theme,
            storage: new Storage(window.localStorage),
            setBreadcrumbs: params.setBreadcrumbs,
            history: params.history,
            actionTypeRegistry,
            ruleTypeRegistry,
            kibanaFeatures,
            licensing: pluginsStart.licensing,
            expressions: pluginsStart.expressions,
            isServerless,
            fieldFormats: pluginsStart.fieldFormats,
            lens: pluginsStart.lens,
            fieldsMetadata: pluginsStart.fieldsMetadata,
            uiActions: pluginsStart.uiActions,
          });
        },
      });
      if (plugins.home) {
        plugins.home.featureCatalogue.register({
          id: ALERTS_PAGE_ID,
          title: alertsFeatureTitle,
          description: alertsFeatureDescription,
          icon: 'watchesApp',
          path: triggersActionsRoute,
          showOnHomePage: false,
          category: 'admin',
        });
      }
    }

    return {
      actionTypeRegistry: this.actionTypeRegistry,
      ruleTypeRegistry: this.ruleTypeRegistry,
    };
  }

  public start(core: CoreStart, plugins: PluginsStart): TriggersAndActionsUIPublicPluginStart {
    const createAlertRuleAction = async () => {
      const action = new AlertRuleFromVisAction(this.ruleTypeRegistry, this.actionTypeRegistry, {
        coreStart: core,
        ...plugins,
      });
      return action;
    };

    plugins.uiActions.addTriggerActionAsync(
      ALERT_RULE_TRIGGER,
      ALERT_RULE_TRIGGER,
      createAlertRuleAction
    );

    plugins.uiActions.addTriggerActionAsync(
      ON_OPEN_PANEL_MENU,
      ALERT_RULE_TRIGGER,
      createAlertRuleAction
    );

    return {
      actionTypeRegistry: this.actionTypeRegistry,
      ruleTypeRegistry: this.ruleTypeRegistry,
      getActionForm: (
        props: Omit<ActionAccordionFormProps, 'actionTypeRegistry' | 'setActions'> & {
          setActions: (actions: RuleAction[]) => void;
        }
      ) => {
        const { setActions, ...restProps } = props;
        return getActionFormLazy({
          ...restProps,
          // TODO remove this cast when every solution is ready to use system actions
          setActions: setActions as (actions: RuleUiAction[]) => void,
          actionTypeRegistry: this.actionTypeRegistry,
          connectorServices: this.connectorServices!,
        });
      },
      getAddConnectorFlyout: (props: Omit<CreateConnectorFlyoutProps, 'actionTypeRegistry'>) => {
        return getAddConnectorFlyoutLazy({
          ...props,
          actionTypeRegistry: this.actionTypeRegistry,
          connectorServices: this.connectorServices!,
          isServerless: !!plugins.serverless,
        });
      },
      getAddConnectorForm: (props: Omit<CreateConnectorFormProps, 'actionTypeRegistry'>) => {
        return getAddConnectorFormLazy({
          ...props,
          actionTypeRegistry: this.actionTypeRegistry,
          connectorServices: this.connectorServices!,
          isServerless: !!plugins.serverless,
        });
      },
      getEditConnectorFlyout: (props: Omit<EditConnectorFlyoutProps, 'actionTypeRegistry'>) => {
        return getEditConnectorFlyoutLazy({
          ...props,
          actionTypeRegistry: this.actionTypeRegistry,
          connectorServices: this.connectorServices!,
          isServerless: !!plugins.serverless,
        });
      },
      getAlertsSearchBar: (props: AlertsSearchBarProps) => {
        return getAlertsSearchBarLazy(props);
      },
      getRuleStatusDropdown: (props: RuleStatusDropdownProps) => {
        return getRuleStatusDropdownLazy(props);
      },
      getRuleTagFilter: (props: RuleTagFilterProps) => {
        return getRuleTagFilterLazy(props);
      },
      getRuleStatusFilter: (props: RuleStatusFilterProps) => {
        return getRuleStatusFilterLazy(props);
      },
      getRuleTagBadge: <T extends RuleTagBadgeOptions>(props: RuleTagBadgeProps<T>) => {
        return getRuleTagBadgeLazy(props);
      },
      getRuleEventLogList: <T extends RuleEventLogListOptions>(props: RuleEventLogListProps<T>) => {
        return getRuleEventLogListLazy(props);
      },
      getGlobalRuleEventLogList: (props: GlobalRuleEventLogListProps) => {
        return getGlobalRuleEventLogListLazy(props);
      },
      getRulesListNotifyBadge: (props: RulesListNotifyBadgePropsWithApi) => {
        return getRulesListNotifyBadgeLazy(props);
      },
      getRulesList: (props: RulesListProps) => {
        return getRulesListLazy({
          connectorServices: this.connectorServices!,
          rulesListProps: props,
        });
      },
      getRuleDefinition: (
        props: Omit<RuleDefinitionProps, 'actionTypeRegistry' | 'ruleTypeRegistry'>
      ) => {
        return getRuleDefinitionLazy({
          ...props,
          actionTypeRegistry: this.actionTypeRegistry,
          ruleTypeRegistry: this.ruleTypeRegistry,
        });
      },
      getRuleStatusPanel: (props: RuleStatusPanelProps) => {
        return getRuleStatusPanelLazy(props);
      },
      getAlertSummaryWidget: (props: AlertSummaryWidgetProps) => {
        const dependencies: AlertSummaryWidgetDependencies['dependencies'] = {
          charts: plugins.charts,
          uiSettings: core.uiSettings,
        };
        return getAlertSummaryWidgetLazy({ ...props, dependencies });
      },
      getRuleSnoozeModal: (props: RuleSnoozeModalProps) => {
        return getRuleSnoozeModalLazy(props);
      },
      getUntrackModal: (props: UntrackAlertsModalProps) => {
        return getUntrackModalLazy(props);
      },
      getRulesSettingsLink: (props: RuleSettingsLinkProps) => {
        return getRulesSettingsLinkLazy(props);
      },
      getRuleHelpers: (rule: Rule<RuleTypeParams>) => {
        return {
          isRuleSnoozed: isRuleSnoozed({
            isSnoozedUntil: rule.isSnoozedUntil,
            muteAll: rule.muteAll,
          }),
          getNextRuleSnoozeSchedule: getNextRuleSnoozeSchedule({
            snoozeSchedule: rule.snoozeSchedule,
          }),
        };
      },
      getAlertFormatter: (ruleTypeId: string): AlertFormatter | undefined => {
        if (!this.ruleTypeRegistry.has(ruleTypeId)) {
          return undefined;
        }
        return this.ruleTypeRegistry.get(ruleTypeId).format;
      },
    };
  }

  public stop() {}
}
