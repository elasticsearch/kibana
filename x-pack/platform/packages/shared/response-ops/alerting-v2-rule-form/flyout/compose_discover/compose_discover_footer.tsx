/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButton, EuiFlexGroup, EuiFlexItem, EuiFlyoutFooter, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useWatch } from 'react-hook-form';
import type { ComposeDiscoverAction, ComposeDiscoverState, StepDefinition } from './types';
import { isAlertConditionStepId, isBuilderConditionStepId } from './types';
import type { FormValues } from '../../form/types';
import { getBreachQuery } from '../../form/utils/query_helpers';
import { getEsqlSummaryState } from './compose_discover_form/esql_query_summary_section';

const CREATE_RULE_BUTTON_LABEL = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.createButtonLabel',
  { defaultMessage: 'Create rule' }
);

const SAVE_RULE_BUTTON_LABEL = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.saveButtonLabel',
  { defaultMessage: 'Save rule' }
);

const BACK_BUTTON_LABEL = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.backButtonLabel',
  { defaultMessage: 'Back' }
);

const NEXT_BUTTON_LABEL = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.nextButtonLabel',
  { defaultMessage: 'Next' }
);

const NEXT_DISABLED_TOOLTIP = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.nextDisabledTooltip',
  { defaultMessage: 'Define a query in the editor before continuing' }
);

const NO_ALERT_CONDITION_NEXT_TOOLTIP = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.noAlertConditionNextTooltip',
  { defaultMessage: 'Add an alert condition to the query before continuing' }
);

const SPLIT_FAILED_NEXT_TOOLTIP = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.splitFailedNextTooltip',
  {
    defaultMessage:
      'Review your query or separate the base query and alert condition before continuing',
  }
);

const VALIDATION_ERRORS_NEXT_TOOLTIP = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.validationErrorsNextTooltip',
  { defaultMessage: 'Resolve ES|QL control placeholders before continuing' }
);

export interface ComposeDiscoverFooterProps {
  uiState: ComposeDiscoverState;
  dispatch: React.Dispatch<ComposeDiscoverAction>;
  currentStep: StepDefinition | undefined;
  isLastStep: boolean;
  isCreate: boolean;
  hasValidationErrors: boolean;
  yamlHasErrors: boolean;
  isBuilderMode: boolean;
  isBuilderStepValid: boolean;
  isSaving: boolean;
  onNext: () => void;
  onFinalSubmit: () => void;
  onYamlSave: () => void;
}

export const ComposeDiscoverFooter = ({
  uiState,
  dispatch,
  currentStep,
  isLastStep,
  isCreate,
  hasValidationErrors,
  yamlHasErrors,
  isBuilderMode,
  isBuilderStepValid,
  isSaving,
  onNext,
  onFinalSubmit,
  onYamlSave,
}: ComposeDiscoverFooterProps): React.ReactElement => {
  const isAlert = useWatch<FormValues, 'kind'>({ name: 'kind' }) === 'alert';
  const watchedQuery = useWatch<FormValues, 'query'>({ name: 'query' });

  const isBuilderStep = currentStep ? isBuilderConditionStepId(currentStep.id) : false;
  const isConditionStep = currentStep ? isAlertConditionStepId(currentStep.id) : false;

  /*
   * Per #621/#623: when authoring an alert via the heuristic-split flow, step 1
   * can only advance once the query has a valid alert condition (composed base +
   * alert segment). no_where, split-failed and empty all block Next.
   */
  const alertConditionState =
    currentStep?.id === 'alertCondition' && isAlert
      ? getEsqlSummaryState(uiState.queryCommitted, watchedQuery)
      : undefined;
  /*
   * Only a clean auto-split ('success') lets an alert rule advance. This blocks
   * 'no_alert_condition', 'empty', and 'split_failed'. Note #622's table shows
   * 'split_failed' as Next-enabled, but that assumes the manual-split CTA (#624)
   * exists to resolve the split; until #624 lands we block it (per #623) to avoid
   * dead-ending users at Create with an unresolvable query.
   */
  const invalidAlertCondition =
    alertConditionState !== undefined && alertConditionState !== 'success';

  const nextDisabled =
    (!isBuilderMode && uiState.childOpen) ||
    hasValidationErrors ||
    (isConditionStep && !isBuilderStep && !uiState.queryCommitted) ||
    (isBuilderStep && !isBuilderStepValid) ||
    invalidAlertCondition;

  const getNextTooltip = (): string | undefined => {
    if (hasValidationErrors) return VALIDATION_ERRORS_NEXT_TOOLTIP;
    if (isConditionStep && !uiState.queryCommitted) return NEXT_DISABLED_TOOLTIP;
    if (alertConditionState === 'no_alert_condition') return NO_ALERT_CONDITION_NEXT_TOOLTIP;
    if (alertConditionState === 'split_failed') return SPLIT_FAILED_NEXT_TOOLTIP;
    if (invalidAlertCondition) return NEXT_DISABLED_TOOLTIP;
    return undefined;
  };

  const isQueryValidForSubmit = (): boolean => {
    if (!uiState.queryCommitted) {
      return false;
    }
    if (isAlert) {
      return getEsqlSummaryState(uiState.queryCommitted, watchedQuery) === 'success';
    }
    return getBreachQuery(watchedQuery).trim().length > 0;
  };

  const submitDisabled = hasValidationErrors || !isQueryValidForSubmit();
  const submitLabel = isCreate ? CREATE_RULE_BUTTON_LABEL : SAVE_RULE_BUTTON_LABEL;

  if (uiState.yamlMode) {
    /*
     * Gate YAML Save on validity only, not the form-shape `submitDisabled`, so
     * non-representable rules (e.g. alert + standalone) stay savable — they never
     * produce a 'success' summary state.
     */
    const yamlSaveDisabled = hasValidationErrors || yamlHasErrors;
    const yamlSaveDisabledTooltip = yamlHasErrors
      ? i18n.translate('xpack.alertingV2.composeDiscover.flyout.yamlSaveDisabledTooltip', {
          defaultMessage: 'Fix the errors highlighted in the YAML editor, then save the rule.',
        })
      : undefined;
    return (
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiToolTip content={yamlSaveDisabledTooltip}>
              <EuiButton
                fill
                onClick={onYamlSave}
                isLoading={isSaving}
                isDisabled={yamlSaveDisabled}
                data-test-subj="composeDiscoverYamlSubmit"
              >
                {submitLabel}
              </EuiButton>
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    );
  }

  return (
    <EuiFlyoutFooter>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
        {/* Back sits far-left; when absent (step 0) the empty item keeps Next flush-right. */}
        <EuiFlexItem grow={false}>
          {uiState.step > 0 && (
            <EuiButton
              color="text"
              iconType="arrowLeft"
              isDisabled={!isBuilderMode && uiState.childOpen}
              onClick={() => dispatch({ type: 'GO_BACK', isBuilderMode })}
              data-test-subj="composeDiscoverBack"
            >
              {BACK_BUTTON_LABEL}
            </EuiButton>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {isLastStep ? (
            <EuiButton
              fill
              isLoading={isSaving}
              isDisabled={submitDisabled}
              onClick={onFinalSubmit}
              data-test-subj="composeDiscoverSubmit"
            >
              {submitLabel}
            </EuiButton>
          ) : (
            <EuiToolTip content={getNextTooltip()}>
              <EuiButton
                color="text"
                iconType="arrowRight"
                iconSide="right"
                isDisabled={nextDisabled}
                onClick={onNext}
                data-test-subj="composeDiscoverNext"
              >
                {NEXT_BUTTON_LABEL}
              </EuiButton>
            </EuiToolTip>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutFooter>
  );
};
