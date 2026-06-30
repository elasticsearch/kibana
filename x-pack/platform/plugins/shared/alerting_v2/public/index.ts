/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { ContainerModule } from 'inversify';
import { OnSetup, PluginSetup, PluginStart, Start } from '@kbn/core-di';
import { CoreSetup, CoreStart } from '@kbn/core-di-browser';
import { i18n } from '@kbn/i18n';
import type { ManagementSetup } from '@kbn/management-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-plugin/public';
import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';
import { WorkflowApi } from '@kbn/workflows-ui';
import { ALERTING_V2_ENABLED_SETTING_ID } from '@kbn/alerting-v2-constants';
import {
  ALERTING_V2_SECTION_ID,
  ALERTING_V2_RULES_APP_ID,
  ALERTING_V2_ACTION_POLICIES_APP_ID,
  ALERTING_V2_EPISODES_APP_ID,
  ALERTING_V2_EXECUTION_HISTORY_APP_ID,
} from './constants';
import { ActionPoliciesApi } from './services/action_policies_api';
import { ExecutionHistoryApi } from './services/execution_history_api';
import { RulesApi } from './services/rules_api';
import { UserCapabilities } from './services/user_capabilities';
import { registerTriggerDefinitions } from './lib/workflow_extensions/register_trigger_definitions';
import { disableAlertingManagementUi } from './lib/disable_management_ui';
import { setKibanaServices } from './kibana_services';
import type { AlertingV2PublicStart } from './types';
import type { CreateRuleOptionsFlyoutProps } from './create_rule_options_flyout';

const LazyCreateRuleOptionsFlyout = React.lazy(() =>
  import('./create_rule_options_flyout').then((m) => ({ default: m.CreateRuleOptionsFlyout }))
);

const CreateRuleOptionsFlyout = (props: CreateRuleOptionsFlyoutProps) =>
  React.createElement(
    React.Suspense,
    { fallback: null },
    React.createElement(LazyCreateRuleOptionsFlyout, props)
  );

export type { AlertingV2PublicStart, CreateRuleOptionsFlyoutLegacyItem } from './types';
export type { CreateRuleOptionsFlyoutProps } from './create_rule_options_flyout';

export const module = new ContainerModule(({ bind }) => {
  bind(RulesApi).toSelf().inSingletonScope();
  bind(ActionPoliciesApi).toSelf().inSingletonScope();
  bind(ExecutionHistoryApi).toSelf().inSingletonScope();
  bind(UserCapabilities).toSelf().inSingletonScope();
  bind(WorkflowApi)
    .toDynamicValue(({ get }) => new WorkflowApi(get(CoreStart('http'))))
    .inSingletonScope();
  bind(Start).toConstantValue({
    CreateRuleOptionsFlyout,
  } satisfies AlertingV2PublicStart);
  bind(OnSetup).toConstantValue((container) => {
    const getStartServices = container.get(CoreSetup('getStartServices'));
    const workflowsExtensionsSetup = container.get(
      PluginSetup('workflowsExtensions')
    ) as WorkflowsExtensionsPublicPluginSetup;

    registerTriggerDefinitions(workflowsExtensionsSetup);

    const management = container.get(PluginSetup('management')) as ManagementSetup;
    const alertingSection = management.sections.register({
      id: ALERTING_V2_SECTION_ID,
      title: 'Alerting V2 Preview',
      tip: 'Start exploring our latest alerts experience',
      order: 1,
    });

    alertingSection.registerApp({
      id: ALERTING_V2_RULES_APP_ID,
      title: 'Rules',
      order: 1,
      async mount(params) {
        const [coreStart] = await getStartServices();
        const { mountAlertingV2App } = await import('./application/mount');
        return mountAlertingV2App({
          params,
          container: coreStart.injection.getContainer(),
          coreStart,
        });
      },
    });

    alertingSection.registerApp({
      id: ALERTING_V2_EPISODES_APP_ID,
      title: i18n.translate('xpack.alertingV2.management.alertEpisodesNavTitle', {
        defaultMessage: 'Alerts',
      }),
      order: 2,
      async mount(params) {
        const [coreStart] = await getStartServices();
        const { mountEpisodesApp } = await import('./application/mount');
        return mountEpisodesApp({
          params,
          container: coreStart.injection.getContainer(),
          coreStart,
        });
      },
    });

    alertingSection.registerApp({
      id: ALERTING_V2_ACTION_POLICIES_APP_ID,
      title: i18n.translate('xpack.alertingV2.management.actionPoliciesNavTitle', {
        defaultMessage: 'Action Policies',
      }),
      order: 3,
      async mount(params) {
        const [coreStart] = await getStartServices();
        const { mountActionPoliciesApp } = await import('./application/mount');
        return mountActionPoliciesApp({
          params,
          container: coreStart.injection.getContainer(),
          coreStart,
        });
      },
    });

    alertingSection.registerApp({
      id: ALERTING_V2_EXECUTION_HISTORY_APP_ID,
      title: i18n.translate('xpack.alertingV2.management.executionHistoryNavTitle', {
        defaultMessage: 'Execution history',
      }),
      order: 5,
      async mount(params) {
        const [coreStart] = await getStartServices();
        const { mountExecutionHistoryApp } = await import('./application/mount');
        return mountExecutionHistoryApp({
          params,
          container: coreStart.injection.getContainer(),
          coreStart,
        });
      },
    });

    getStartServices().then(([coreStart]) => {
      const diContainer = coreStart.injection.getContainer();

      const dashboardToken = PluginStart('dashboard');
      const dashboard = diContainer.isBound(dashboardToken)
        ? (diContainer.get(dashboardToken) as DashboardStart)
        : undefined;

      // Optional RuleFormServices field; used by ComposeDiscoverFlyout (CpsPicker), not artifacts UI.
      const cpsToken = PluginStart('cps');
      const cps = diContainer.isBound(cpsToken)
        ? (diContainer.get(cpsToken) as CPSPluginStart)
        : undefined;

      setKibanaServices({
        http: coreStart.http,
        notifications: coreStart.notifications,
        application: coreStart.application,
        uiSettings: coreStart.uiSettings,
        data: diContainer.get(PluginStart('data')) as DataPublicPluginStart,
        dataViews: diContainer.get(PluginStart('dataViews')) as DataViewsPublicPluginStart,
        lens: diContainer.get(PluginStart('lens')) as LensPublicStart,
        expressions: diContainer.get(PluginStart('expressions')) as ExpressionsStart,
        uiActions: diContainer.get(PluginStart('uiActions')) as UiActionsStart,
        dashboard,
        cps,
        container: diContainer,
      });

      const alertingEnabled = coreStart.settings.globalClient.get<boolean>(
        ALERTING_V2_ENABLED_SETTING_ID,
        false
      );

      if (!alertingEnabled) {
        disableAlertingManagementUi(alertingSection);
        return;
      }

      const agentBuilderToken = PluginStart('agentBuilder');
      if (diContainer.isBound(agentBuilderToken)) {
        const agentBuilder = diContainer.get(agentBuilderToken) as AgentBuilderPluginStart;
        import(
          /* webpackChunkName: "alerting_v2_rule_attachment" */
          './agent_builder/attachments/rule_attachment_definition'
        ).then(({ createRuleAttachmentDefinition, RULE_ATTACHMENT_TYPE: ruleAttachmentType }) => {
          agentBuilder.attachments.addAttachmentType(
            ruleAttachmentType,
            createRuleAttachmentDefinition({
              container: diContainer,
            })
          );
        });
        import(
          /* webpackChunkName: "alerting_v2_action_policy_attachment" */
          './agent_builder/attachments/action_policy_attachment_definition'
        ).then(
          ({
            createActionPolicyAttachmentDefinition,
            ACTION_POLICY_ATTACHMENT_TYPE: actionPolicyAttachmentType,
          }) => {
            agentBuilder.attachments.addAttachmentType(
              actionPolicyAttachmentType,
              createActionPolicyAttachmentDefinition({
                container: diContainer,
              })
            );
          }
        );
      }
    });
  });
});
