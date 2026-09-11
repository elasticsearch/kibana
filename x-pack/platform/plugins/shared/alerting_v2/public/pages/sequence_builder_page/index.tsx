/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { FormProvider } from 'react-hook-form';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { PluginStart } from '@kbn/core-di';
import { CoreStart, useService } from '@kbn/core-di-browser';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public';
import { RuleFormProvider } from '@kbn/alerting-v2-rule-form';
import type { RuleFormServices } from '@kbn/alerting-v2-rule-form';
import { useAlertingLocators } from '../../application/locator_context';
import { useSequenceBuilderForm, useSequenceBuilderState } from './use_sequence_builder_form';
import { SequenceBuilderHeader } from './sequence_builder_header';
import { AlertConditionCanvas } from './alert_condition_canvas';
import {
  RecoveryConditionCanvas,
  DEFAULT_RECOVERY_CONFIG,
  resolveRecoveryIndices,
} from './recovery_condition_canvas';
import type { RecoveryConfig } from './recovery_condition_canvas';

const useRuleFormServicesBag = (): RuleFormServices => {
  const http = useService(CoreStart('http'));
  const notifications = useService(CoreStart('notifications'));
  const application = useService(CoreStart('application'));
  const uiSettings = useService(CoreStart('uiSettings'));
  const featureFlags = useService(CoreStart('featureFlags'));
  const data = useService(PluginStart('data')) as DataPublicPluginStart;
  const dataViews = useService(PluginStart('dataViews')) as DataViewsPublicPluginStart;
  const lens = useService(PluginStart('lens')) as LensPublicStart;
  const uiActions = useService(PluginStart('uiActions')) as UiActionsStart;
  const dashboard = useService(PluginStart('dashboard'), { optional: true }) as
    | DashboardStart
    | undefined;
  const cps = useService(PluginStart('cps'), { optional: true }) as CPSPluginStart | undefined;

  return useMemo<RuleFormServices>(
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
};

export const SequenceBuilderPage: React.FC = () => {
  const ruleFormServices = useRuleFormServicesBag();
  const { rulesLocators } = useAlertingLocators();

  const { methods } = useSequenceBuilderForm();
  const uiState = useSequenceBuilderState();
  const [isRuleListOpen, setIsRuleListOpen] = useState(true);
  const handleToggleRuleList = useCallback(() => setIsRuleListOpen((prev) => !prev), []);
  const [recoveryConfig, setRecoveryConfig] = useState<RecoveryConfig>(DEFAULT_RECOVERY_CONFIG);

  const handleStepChange = useCallback(
    (nextStep: 'alert' | 'recovery') => {
      if (nextStep === 'recovery') {
        uiState.setSeqValues((prev) => ({
          ...prev,
          ...resolveRecoveryIndices(
            recoveryConfig.mode,
            prev.steps.length,
            prev.recoveryStepIndices
          ),
        }));
      }
      uiState.setStep(nextStep);
    },
    [uiState, recoveryConfig.mode]
  );

  const handleCancel = useCallback(() => {
    rulesLocators.navigateSync({});
  }, [rulesLocators]);

  const rulesListHref = rulesLocators.useUrl({});

  const handleSave = methods.handleSubmit((formValues) => uiState.save(formValues));

  const canvasContent =
    uiState.step === 'alert' ? (
      <AlertConditionCanvas
        seqValues={uiState.seqValues}
        setSeqValues={uiState.setSeqValues}
        isRuleListOpen={isRuleListOpen}
        onToggleRuleList={handleToggleRuleList}
      />
    ) : (
      <RecoveryConditionCanvas
        seqValues={uiState.seqValues}
        setSeqValues={uiState.setSeqValues}
        recoveryConfig={recoveryConfig}
        setRecoveryConfig={setRecoveryConfig}
        isRuleListOpen={isRuleListOpen}
        onToggleRuleList={handleToggleRuleList}
      />
    );

  return (
    <RuleFormProvider services={ruleFormServices} meta={{ layout: 'flyout' }}>
      <FormProvider {...methods}>
        <EuiFlexGroup
          direction="column"
          gutterSize="none"
          style={{ height: '100%', overflow: 'hidden' }}
        >
          <EuiFlexItem grow={false}>
            <SequenceBuilderHeader
              step={uiState.step}
              seqValues={uiState.seqValues}
              isSaving={uiState.isSaving}
              rulesListHref={rulesListHref}
              onStepChange={handleStepChange}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </EuiFlexItem>

          <EuiFlexItem style={{ minHeight: 0 }}>{canvasContent}</EuiFlexItem>
        </EuiFlexGroup>
      </FormProvider>
    </RuleFormProvider>
  );
};
