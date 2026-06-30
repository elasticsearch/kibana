/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiForm, EuiSpacer } from '@elastic/eui';
import { useFormContext } from 'react-hook-form';
import {
  RULE_FORM_ID,
  RuleDetailsFieldGroup,
  ConditionFieldGroup,
  RuleExecutionFieldGroup,
  SubmissionButtons,
  ErrorCallOut,
} from '@kbn/alerting-v2-rule-form';
import type { FormValues } from '@kbn/alerting-v2-rule-form';
import type { RuleParams } from '@kbn/alerting-v2-schemas';
import type { ISearchGeneric } from '@kbn/search-types';
import type { SecurityRuleType } from '../constants';
import * as i18n from '../translations';
import { RuleTypeSwitcher } from './rule_type_switcher';
import { ThresholdFields } from './threshold_fields';
import { SuppressionDurationField } from './suppression_duration_field';
import { SecurityDetectionFields } from './security_detection_fields';

type ThreatEntry = NonNullable<RuleParams['threat']>[number];
type RelatedIntegration = NonNullable<RuleParams['related_integrations']>[number];

interface SecurityGuiRuleFormProps {
  onSubmit: (values: FormValues) => void;
  ruleType: SecurityRuleType;
  onRuleTypeChange: (ruleType: SecurityRuleType) => void;
  isUpdateView: boolean;
  isSubmitting: boolean;
  onCancel?: () => void;
  ruleId?: string;
  indexPatterns: string[];
  onIndexPatternsChange: (patterns: string[]) => void;
  groupByFields: string[];
  onGroupByFieldsChange: (fields: string[]) => void;
  thresholdValue: number;
  onThresholdValueChange: (value: number) => void;
  cardinalityField: string;
  onCardinalityFieldChange: (field: string) => void;
  cardinalityValue: number;
  onCardinalityValueChange: (value: number) => void;
  filterQuery: string;
  onFilterQueryChange: (query: string) => void;
  generatedQuery: string;
  search: ISearchGeneric;
  threat: ThreatEntry[];
  onThreatChange: (threat: ThreatEntry[]) => void;
  note: string;
  onNoteChange: (note: string) => void;
  setup: string;
  onSetupChange: (setup: string) => void;
  relatedIntegrations: RelatedIntegration[];
  onRelatedIntegrationsChange: (integrations: RelatedIntegration[]) => void;
  investigationFieldNames: string[];
  onInvestigationFieldNamesChange: (fieldNames: string[]) => void;
  references: string[];
  onReferencesChange: (references: string[]) => void;
}

export const SecurityGuiRuleForm = ({
  onSubmit,
  ruleType,
  onRuleTypeChange,
  isUpdateView,
  isSubmitting,
  onCancel,
  ruleId,
  indexPatterns,
  onIndexPatternsChange,
  groupByFields,
  onGroupByFieldsChange,
  thresholdValue,
  onThresholdValueChange,
  cardinalityField,
  onCardinalityFieldChange,
  cardinalityValue,
  onCardinalityValueChange,
  filterQuery,
  onFilterQueryChange,
  generatedQuery,
  search,
  threat,
  onThreatChange,
  note,
  onNoteChange,
  setup,
  onSetupChange,
  relatedIntegrations,
  onRelatedIntegrationsChange,
  investigationFieldNames,
  onInvestigationFieldNamesChange,
  references,
  onReferencesChange,
}: SecurityGuiRuleFormProps) => {
  const { handleSubmit } = useFormContext<FormValues>();

  return (
    <>
      <ErrorCallOut />
      <EuiSpacer size="m" />
      <EuiForm id={RULE_FORM_ID} component="form" onSubmit={handleSubmit(onSubmit)}>
        <RuleTypeSwitcher
          ruleType={ruleType}
          onChange={onRuleTypeChange}
          isUpdateView={isUpdateView}
        />
        {ruleType === 'threshold' && (
          <>
            <EuiSpacer size="m" />
            <ThresholdFields
              indexPatterns={indexPatterns}
              onIndexPatternsChange={onIndexPatternsChange}
              groupByFields={groupByFields}
              onGroupByFieldsChange={onGroupByFieldsChange}
              thresholdValue={thresholdValue}
              onThresholdValueChange={onThresholdValueChange}
              cardinalityField={cardinalityField}
              onCardinalityFieldChange={onCardinalityFieldChange}
              cardinalityValue={cardinalityValue}
              onCardinalityValueChange={onCardinalityValueChange}
              filterQuery={filterQuery}
              onFilterQueryChange={onFilterQueryChange}
              generatedQuery={generatedQuery}
              search={search}
            />
          </>
        )}
        <EuiSpacer size="m" />
        <RuleDetailsFieldGroup />
        <EuiSpacer size="m" />
        <ConditionFieldGroup
          includeBase={ruleType !== 'threshold'}
          groupFieldLabel={i18n.SUPPRESSION_FIELDS_LABEL}
        />
        <EuiSpacer size="m" />
        <SuppressionDurationField />
        <EuiSpacer size="m" />
        <RuleExecutionFieldGroup />
        <EuiSpacer size="m" />
        <SecurityDetectionFields
          threat={threat}
          onThreatChange={onThreatChange}
          note={note}
          onNoteChange={onNoteChange}
          setup={setup}
          onSetupChange={onSetupChange}
          relatedIntegrations={relatedIntegrations}
          onRelatedIntegrationsChange={onRelatedIntegrationsChange}
          investigationFieldNames={investigationFieldNames}
          onInvestigationFieldNamesChange={onInvestigationFieldNamesChange}
          references={references}
          onReferencesChange={onReferencesChange}
        />
      </EuiForm>
      <SubmissionButtons isSubmitting={isSubmitting} onCancel={onCancel} ruleId={ruleId} />
    </>
  );
};
