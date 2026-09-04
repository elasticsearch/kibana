/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  BuilderState,
  ComposeDiscoverMode,
  RuleFormServices,
} from '@kbn/alerting-v2-rule-form';
import { ComposeDiscoverFlyout, RULE_BUILDER_REGISTRY } from '@kbn/alerting-v2-rule-form';
import type { RuleTemplateResponse } from '@kbn/alerting-v2-schemas';
import { PluginStart } from '@kbn/core-di';
import { CoreStart, useService } from '@kbn/core-di-browser';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import { i18n } from '@kbn/i18n';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import React, { useCallback, useMemo, useState } from 'react';
import type { RuleApiResponse } from '../services/rules_api';
import { useBuilderToEsqlTransition } from './use_builder_to_esql_transition';
import { useCreateRule } from './use_create_rule';
import { useSetupRuleNotifications } from './use_setup_rule_notifications';
import { useUpdateRule } from './use_update_rule';

/**
 * A template whose rule carries builder fields has no query of its own — the
 * server generates it on save — so seed an empty one in the kind's own format
 * to open the editor the form would otherwise refuse to show.
 */
const emptyQueryFor = (kind: RuleApiResponse['kind']): RuleApiResponse['query'] =>
  kind === 'signal'
    ? { format: 'standalone', breach: { query: '' } }
    : { format: 'composed', base: '' };

const templateToSyntheticRule = (template: RuleTemplateResponse): RuleApiResponse => ({
  ...template.rule,
  query: template.rule.query ?? emptyQueryFor(template.rule.kind),
  id: '',
  enabled: false,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_by: null,
  updated_at: new Date().toISOString(),
  metadata: {
    ...template.rule.metadata,
    version: 1,
  },
});

interface UseComposeDiscoverFlyoutOptions {
  createSuccessRedirectPath?: string;
}

export const useComposeDiscoverFlyout = ({
  createSuccessRedirectPath,
}: UseComposeDiscoverFlyoutOptions = {}) => {
  const http = useService(CoreStart('http'));
  const notifications = useService(CoreStart('notifications'));
  const application = useService(CoreStart('application'));
  const uiSettings = useService(CoreStart('uiSettings'));
  const featureFlags = useService(CoreStart('featureFlags'));
  const data = useService(PluginStart('data')) as DataPublicPluginStart;
  const dataViews = useService(PluginStart('dataViews')) as DataViewsPublicPluginStart;
  const lens = useService(PluginStart('lens')) as LensPublicStart;
  const uiActions = useService(PluginStart('uiActions')) as UiActionsStart;
  // `dashboard` is an optional plugin dependency; resolve it leniently so the
  // flyout still mounts in environments where the dashboard plugin is disabled.
  const dashboard = useService(PluginStart('dashboard'), { optional: true }) as
    | DashboardStart
    | undefined;
  const cps = useService(PluginStart('cps'), { optional: true }) as CPSPluginStart | undefined;

  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [flyoutMode, setFlyoutMode] = useState<ComposeDiscoverMode>('create');
  const [targetRule, setTargetRule] = useState<RuleApiResponse | null>(null);
  const [builderType, setBuilderType] = useState<string | null>(null);
  const [initialBuilderState, setInitialBuilderState] = useState<BuilderState>(undefined);
  const historyKey = useMemo(() => Symbol('ruleAuthoring'), []);

  const openInEsql = useCallback((rule: RuleApiResponse, mode: ComposeDiscoverMode) => {
    setTargetRule(rule);
    setFlyoutMode(mode);
    setBuilderType(null);
    setInitialBuilderState(undefined);
    setFlyoutOpen(true);
  }, []);

  const handleConfirmSwitch = useCallback(() => {
    setBuilderType(null);
    setInitialBuilderState(undefined);
  }, []);

  const { resolveBuilderMode, requestEsqlFallback, requestSwitchToEsql, confirmationModal } =
    useBuilderToEsqlTransition({
      onConfirmEsqlFallback: openInEsql,
      onConfirmSwitch: handleConfirmSwitch,
    });

  const createRuleMutation = useCreateRule();
  const setupNotificationsMutation = useSetupRuleNotifications();
  const updateRuleMutation = useUpdateRule();
  const ruleFormServices = useMemo<RuleFormServices>(
    () => ({
      http,
      data,
      dataViews,
      notifications,
      application,
      uiSettings,
      featureFlags,
      lens,
      uiActions,
      dashboard,
      cps,
    }),
    [
      http,
      data,
      dataViews,
      notifications,
      application,
      uiSettings,
      featureFlags,
      lens,
      uiActions,
      dashboard,
      cps,
    ]
  );

  const closeFlyout = useCallback(() => {
    setFlyoutOpen(false);
    setTargetRule(null);
    setBuilderType(null);
    setInitialBuilderState(undefined);
  }, []);

  const closeAndRedirect = useCallback(() => {
    setFlyoutOpen(false);
    if (createSuccessRedirectPath) {
      application.navigateToUrl(http.basePath.prepend(createSuccessRedirectPath));
    }
  }, [application, createSuccessRedirectPath, http]);

  const openCreateFlyout = useCallback(() => {
    setTargetRule(null);
    setFlyoutMode('create');
    setBuilderType(null);
    setFlyoutOpen(true);
  }, []);

  const openCreateBuilderFlyout = useCallback(
    (type: string) => {
      if (!RULE_BUILDER_REGISTRY[type]) {
        notifications.toasts.addWarning({
          title: i18n.translate('xpack.alertingV2.useComposeDiscoverFlyout.unknownBuilderTitle', {
            defaultMessage: 'Unknown rule builder type',
          }),
          text: i18n.translate('xpack.alertingV2.useComposeDiscoverFlyout.unknownBuilderText', {
            defaultMessage: 'No builder registered for type "{type}". Opening ES|QL mode instead.',
            values: { type },
          }),
        });
        setTargetRule(null);
        setFlyoutMode('create');
        setBuilderType(null);
        setFlyoutOpen(true);
        return;
      }
      setTargetRule(null);
      setFlyoutMode('create');
      setBuilderType(type);
      setInitialBuilderState(undefined);
      setFlyoutOpen(true);
    },
    [notifications.toasts]
  );

  const openRuleFlyout = useCallback(
    (rule: RuleApiResponse, mode: ComposeDiscoverMode) => {
      const result = resolveBuilderMode(rule);
      if (result === 'esql') {
        openInEsql(rule, mode);
      } else if (result === 'esql-fallback') {
        requestEsqlFallback(rule, mode);
      } else {
        setTargetRule(rule);
        setFlyoutMode(mode);
        setBuilderType(result.builderType);
        setInitialBuilderState(result.initialBuilderState);
        setFlyoutOpen(true);
      }
    },
    [resolveBuilderMode, openInEsql, requestEsqlFallback]
  );

  const openEditFlyout = useCallback(
    (rule: RuleApiResponse) => openRuleFlyout(rule, 'edit'),
    [openRuleFlyout]
  );

  const openCloneFlyout = useCallback(
    (rule: RuleApiResponse) => openRuleFlyout(rule, 'clone'),
    [openRuleFlyout]
  );

  const openCreateFromTemplateFlyout = useCallback(
    (template: RuleTemplateResponse) => {
      const syntheticRule = templateToSyntheticRule(template);
      const result = resolveBuilderMode(syntheticRule);
      if (result !== 'esql' && result !== 'esql-fallback') {
        setTargetRule(syntheticRule);
        setFlyoutMode('create');
        setBuilderType(result.builderType);
        setInitialBuilderState(result.initialBuilderState);
        setFlyoutOpen(true);
      } else {
        openInEsql(syntheticRule, 'create');
      }
    },
    [resolveBuilderMode, openInEsql]
  );

  const flyout = flyoutOpen ? (
    <ComposeDiscoverFlyout
      historyKey={historyKey}
      mode={flyoutMode}
      rule={targetRule ?? undefined}
      ruleId={flyoutMode === 'edit' ? targetRule?.id : undefined}
      onClose={closeFlyout}
      services={ruleFormServices}
      builderType={builderType ?? undefined}
      initialBuilderState={initialBuilderState}
      onSwitchToEsql={builderType ? requestSwitchToEsql : undefined}
      onCreateRule={(payload, ruleNotifications) =>
        createRuleMutation.mutate(
          { payload },
          {
            onSuccess: (rule) => {
              const actions = ruleNotifications?.workflows ?? [];
              if (actions.length > 0) {
                setupNotificationsMutation.mutate(
                  { rule, actions },
                  { onSuccess: closeAndRedirect, onError: closeAndRedirect }
                );
              } else {
                closeAndRedirect();
              }
            },
          }
        )
      }
      onUpdateRule={(id, payload, ruleNotifications) =>
        updateRuleMutation.mutate(
          { id, payload },
          {
            onSuccess: (rule) => {
              const actions = ruleNotifications?.workflows ?? [];
              if (actions.length === 0) {
                closeFlyout();
                return;
              }
              // Only close the flyout once notification setup also succeeds
              setupNotificationsMutation.mutate({ rule, actions }, { onSuccess: closeFlyout });
            },
          }
        )
      }
      isSaving={
        createRuleMutation.isLoading ||
        setupNotificationsMutation.isLoading ||
        updateRuleMutation.isLoading
      }
    />
  ) : null;

  return {
    flyout,
    confirmationModal,
    openCreateFlyout,
    openCreateBuilderFlyout,
    openCreateFromTemplateFlyout,
    openEditFlyout,
    openCloneFlyout,
  };
};
