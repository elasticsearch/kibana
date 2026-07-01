/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { useWatch } from 'react-hook-form';
import { EuiHorizontalRule, EuiSpacer } from '@elastic/eui';
import type {
  ComposeDiscoverState,
  ComposeDiscoverAction,
  RecoveryType,
  StepDefinition,
  StepRenderProps,
} from '../types';
import { isAlertConditionStepId } from '../types';
import { getStepIds, getBuilderStepIds } from '../use_compose_discover_state';
import type { FormValues } from '../../../form/types';
import { getBreachQuery } from '../../../form/utils/query_helpers';
import { getEsqlSummaryState } from './esql_query_summary_section';
import type { RuleFormServices } from '../../../form/contexts/rule_form_context';
import { RULE_BUILDER_REGISTRY } from '../rule_builder';
import { isActionValid } from '../../../actions_form';
import { ModeSelect } from '../../../form/fields/mode_select';
import { AlertDelayField } from '../../../form/fields/alert_delay_field';
import { ScheduleField } from '../../../form/fields/schedule_field';
import { LookbackWindowField } from '../../../form/fields/lookback_window_field';
import { AlertConditionStep } from './alert_condition_step';
import { RecoveryConditionStep } from './recovery_condition_step';
import { EsqlRecoveryContent } from './esql_recovery_content';
import { DetailsAndArtifactsStep } from './details_and_artifacts_step';
import { NotificationsStep } from './notifications_step';
import { LinkedActionPoliciesStep } from './linked_action_policies_step';
import { CentralizedActionPoliciesPanel } from './centralized_action_policies_panel';

interface Props {
  state: ComposeDiscoverState;
  dispatch: React.Dispatch<ComposeDiscoverAction>;
  services: RuleFormServices;
  onRecoveryTypeChange: (type: RecoveryType) => void;
  onKindChange: (kind: 'signal' | 'alert') => void;
  isEditing: boolean;
  ruleId?: string;
  builderType?: string;
}

const STEP_REGISTRY: Record<StepDefinition['id'], StepDefinition> = {
  alertCondition: {
    id: 'alertCondition',
    title: i18n.translate('xpack.alertingV2.composeDiscover.alertCondition.stepTitle', {
      defaultMessage: 'Alert Condition',
    }),
    render: (props) => (
      <AlertConditionStep
        state={props.state}
        dispatch={props.dispatch}
        services={props.services}
        isEditing={props.isEditing}
      />
    ),
    validate: (methods, s) => {
      if (!s.queryCommitted) {
        return false;
      }
      const query = methods.getValues('query');
      /*
       * Alert rules require a valid alert condition to advance (#621/#623): the
       * heuristic split must succeed (composed base + alert segment). no_where,
       * split-failed and empty all block Next.
       */
      if (methods.getValues('kind') === 'alert') {
        return getEsqlSummaryState(s.queryCommitted, query) === 'success';
      }
      return getBreachQuery(query).trim().length > 0;
    },
  },
  builderCondition: {
    id: 'builderCondition',
    title: i18n.translate('xpack.alertingV2.composeDiscover.step.builderCondition', {
      defaultMessage: 'Alert Condition',
    }),
    render: () => null,
    validate: (_methods, s) => s.queryCommitted,
  },
  recoveryCondition: {
    id: 'recoveryCondition',
    title: i18n.translate('xpack.alertingV2.composeDiscover.recoveryCondition.stepTitle', {
      defaultMessage: 'Recovery Condition',
    }),
    render: (props) => (
      <RecoveryConditionStep
        state={props.state}
        dispatch={props.dispatch}
        onRecoveryTypeChange={props.onRecoveryTypeChange}
        renderCustomRecovery={props.renderCustomRecovery}
      />
    ),
  },
  details: {
    id: 'details',
    title: i18n.translate('xpack.alertingV2.composeDiscover.details.stepTitle', {
      defaultMessage: 'Details & Artifacts',
    }),
    render: () => <DetailsAndArtifactsStep />,
    validate: async (methods) => methods.trigger(['metadata.name']),
  },
  notifications: {
    id: 'notifications',
    title: i18n.translate('xpack.alertingV2.composeDiscover.notifications.stepTitle', {
      defaultMessage: 'Actions',
    }),
    render: (props) => (
      <>
        <CentralizedActionPoliciesPanel http={props.services.http} />
        <EuiSpacer size="m" />
        <LinkedActionPoliciesStep http={props.services.http} ruleId={props.ruleId} />
        {props.ruleId === undefined && (
          <>
            <EuiHorizontalRule margin="m" />
            <NotificationsStep />
          </>
        )}
      </>
    ),
    validate: (methods) => {
      const notifs = methods.getValues('notifications');
      if (!notifs) return true;
      return notifs.workflows.every(isActionValid);
    },
  },
};

interface ResolvedSteps {
  steps: StepDefinition[];
  renderCustomRecovery?: StepRenderProps['renderCustomRecovery'];
}

export const getSteps = (isAlert: boolean, builderType?: string): ResolvedSteps => {
  const ids = builderType ? getBuilderStepIds(isAlert) : getStepIds(isAlert);
  const definition = builderType ? RULE_BUILDER_REGISTRY[builderType] : undefined;

  const steps = ids.map((id) => {
    const base = STEP_REGISTRY[id];
    if (id === 'builderCondition' && definition) {
      const step: StepDefinition = {
        ...base,
        title: definition.stepTitle,
        render: (props) =>
          definition.renderStep({
            state: props.state,
            dispatch: props.dispatch,
            services: props.services,
          }),
        validate: definition.validate
          ? (_methods, s, _services, bs) => definition.validate!(s, bs)
          : base.validate,
      };
      return step;
    }
    return base;
  });

  const renderCustomRecovery = definition?.renderRecoveryStep ?? EsqlRecoveryContent;

  return { steps, renderCustomRecovery };
};

export const ComposeDiscoverForm = ({
  state,
  dispatch,
  services,
  onRecoveryTypeChange,
  onKindChange,
  isEditing,
  ruleId,
  builderType,
}: Props) => {
  const isAlert = useWatch<FormValues, 'kind'>({ name: 'kind' }) === 'alert';
  const { steps, renderCustomRecovery } = useMemo(
    () => getSteps(isAlert, builderType),
    [isAlert, builderType]
  );
  const currentStep = steps[state.step];
  const isAlertConditionStep = isAlertConditionStepId(currentStep.id);

  const stepContent = currentStep.render({
    state,
    dispatch,
    services,
    onRecoveryTypeChange,
    isEditing,
    ruleId,
    renderCustomRecovery,
  });

  if (!isAlertConditionStep) {
    return stepContent;
  }

  return (
    <>
      <ModeSelect
        value={isAlert ? 'alert' : 'signal'}
        onChange={onKindChange}
        disabled={(!builderType && !state.queryCommitted) || isEditing || state.childOpen}
        compressed
        data-test-subj="composeDiscoverModeSelect"
      />
      <EuiSpacer size="m" />
      {stepContent}
      {isAlert && (
        <>
          <EuiSpacer size="m" />
          <AlertDelayField />
        </>
      )}
      <EuiSpacer size="m" />
      <ScheduleField />
      <EuiSpacer size="m" />
      <LookbackWindowField />
    </>
  );
};
