/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiButtonGroupOptionProps } from '@elastic/eui';
import {
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import type { FC } from 'react';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { i18n as i18nCore } from '@kbn/i18n';
import { isEqual } from 'lodash';
import type { FieldSpec } from '@kbn/data-plugin/common';

import type { SavedQuery } from '@kbn/data-plugin/public';
import type { DataViewBase } from '@kbn/es-query';
import { FormattedMessage } from '@kbn/i18n-react';
import type { SetRuleQuery } from '../../../../detections/hooks/use_rule_from_timeline';
import { useRuleFromTimeline } from '../../../../detections/hooks/use_rule_from_timeline';
import { useKibana } from '../../../../common/lib/kibana';
import { isMlRule } from '../../../../../common/machine_learning/helpers';
import { filterRuleFieldsForType, getStepDataDataSource } from '../../pages/rule_creation/helpers';
import type { DefineStepRule, RuleStepProps } from '../../../common/types';
import { DataSourceType } from '../../../common/types';
import { StepRuleDescription } from '../description_step';
import type { QueryBarFieldProps } from '../query_bar_field';
import { QueryBarField } from '../query_bar_field';
import { SelectRuleType } from '../select_rule_type';
import { PickTimeline } from '../../../rule_creation/components/pick_timeline';
import { StepContentWrapper } from '../../../rule_creation/components/step_content_wrapper';
import type { FormHook } from '../../../../shared_imports';
import {
  Field,
  Form,
  getUseField,
  HiddenField,
  UseField,
  useFormData,
} from '../../../../shared_imports';
import { schema } from './schema';
import { useExperimentalFeatureFieldsTransform } from './use_experimental_feature_fields_transform';
import * as i18n from './translations';
import {
  isEqlRule,
  isEsqlRule,
  isNewTermsRule,
  isQueryRule,
  isSuppressionRuleInGA,
  isThreatMatchRule,
  isThresholdRule as getIsThresholdRule,
} from '../../../../../common/detection_engine/utils';
import { EqlQueryEdit } from '../../../rule_creation/components/eql_query_edit';
import { DataViewSelectorField } from '../data_view_selector_field';
import { useFetchIndex } from '../../../../common/containers/source';
import { RequiredFields } from '../../../rule_creation/components/required_fields';
import { DocLink } from '../../../../common/components/links_to_docs/doc_link';
import { useLicense } from '../../../../common/hooks/use_license';
import { MINIMUM_LICENSE_FOR_SUPPRESSION } from '../../../../../common/detection_engine/constants';
import { useUpsellingMessage } from '../../../../common/hooks/use_upselling';
import { useAllEsqlRuleFields } from '../../hooks';
import { useAlertSuppression } from '../../../rule_management/logic/use_alert_suppression';
import { AiAssistant } from '../ai_assistant';
import { RelatedIntegrations } from '../../../rule_creation/components/related_integrations';
import { useMLRuleConfig } from '../../../../common/components/ml/hooks/use_ml_rule_config';
import { useTermsAggregationFields } from '../../../../common/hooks/use_terms_aggregation_fields';
import {
  ALERT_SUPPRESSION_FIELDS_FIELD_NAME,
  AlertSuppressionEdit,
} from '../../../rule_creation/components/alert_suppression_edit';
import { ThresholdAlertSuppressionEdit } from '../../../rule_creation/components/threshold_alert_suppression_edit';
import { MachineLearningJobIdEdit } from '../../../rule_creation/components/machine_learning_job_id_edit';
import { ThresholdEdit } from '../../../rule_creation/components/threshold_edit';
import { AnomalyThresholdEdit } from '../../../rule_creation/components/anomaly_threshold_edit/anomaly_threshold_edit';
import { HistoryWindowStartEdit } from '../../../rule_creation/components/history_window_start_edit';
import { NewTermsFieldsEdit } from '../../../rule_creation/components/new_terms_fields_edit';
import { EsqlQueryEdit } from '../../../rule_creation/components/esql_query_edit';
import { CreateCustomMlJobButton } from '../../../rule_creation/components/create_ml_job_button/create_ml_job_button';
import { ThreatMatchEdit } from '../threat_match_edit';
import { usePersistentNewTermsState } from './use_persistent_new_terms_state';
import { usePersistentAlertSuppressionState } from './use_persistent_alert_suppression_state';
import { usePersistentThresholdState } from './use_persistent_threshold_state';
import { usePersistentQuery } from './use_persistent_query';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { usePersistentMachineLearningState } from './use_persistent_machine_learning_state';
import { usePersistentThreatMatchState } from './use_persistent_threat_match_state';

const CommonUseField = getUseField({ component: Field });

const StyledVisibleContainer = styled.div<{ isVisible: boolean }>`
  display: ${(props) => (props.isVisible ? 'block' : 'none')};
`;

export interface StepDefineRuleProps extends RuleStepProps {
  indicesConfig: string[];
  defaultSavedQuery?: SavedQuery;
  form: FormHook<DefineStepRule>;
  indexPattern: DataViewBase;
  isIndexPatternLoading: boolean;
  isQueryBarValid: boolean;
  setIsQueryBarValid: (valid: boolean) => void;
  index: string[];
  threatIndex: string[];
  alertSuppressionFields?: string[];
  dataSourceType: DataSourceType;
  shouldLoadQueryDynamically: boolean;
  queryBarTitle: string | undefined;
  queryBarSavedId: string | null | undefined;
}

interface StepDefineRuleReadOnlyProps {
  addPadding: boolean;
  descriptionColumns: 'multi' | 'single' | 'singleSplit';
  defaultValues: DefineStepRule;
  indexPattern: DataViewBase;
}

export const MyLabelButton = styled(EuiButtonEmpty)`
  height: 18px;
  font-size: 12px;

  .euiIcon {
    width: 14px;
    height: 14px;
  }
`;

MyLabelButton.defaultProps = {
  flush: 'right',
};

const RuleTypeEuiFormRow = styled(EuiFormRow).attrs<{ $isVisible: boolean }>(({ $isVisible }) => ({
  style: {
    display: $isVisible ? 'flex' : 'none',
  },
}))<{ $isVisible: boolean }>``;

const StepDefineRuleComponent: FC<StepDefineRuleProps> = ({
  dataSourceType,
  defaultSavedQuery,
  form,
  alertSuppressionFields,
  index,
  indexPattern,
  indicesConfig,
  isIndexPatternLoading,
  isLoading,
  isQueryBarValid,
  isUpdateView = false,
  queryBarSavedId,
  queryBarTitle,
  setIsQueryBarValid,
  shouldLoadQueryDynamically,
  threatIndex,
}) => {
  const [{ ruleType, queryBar, machineLearningJobId, threshold }] = useFormData<DefineStepRule>({
    form,
    watch: ['ruleType', 'queryBar', 'machineLearningJobId', 'threshold.field'],
  });

  const [openTimelineSearch, setOpenTimelineSearch] = useState(false);
  const [indexModified, setIndexModified] = useState(false);
  const license = useLicense();

  const {
    allJobsStarted,
    hasMlAdminPermissions,
    hasMlLicense,
    loading: mlRuleConfigLoading,
    mlSuppressionFields,
  } = useMLRuleConfig({ machineLearningJobId });

  const isMlSuppressionIncomplete =
    isMlRule(ruleType) &&
    machineLearningJobId &&
    machineLearningJobId?.length > 0 &&
    !allJobsStarted;

  const isAlertSuppressionLicenseValid = license.isAtLeast(MINIMUM_LICENSE_FOR_SUPPRESSION);

  const isThresholdRule = getIsThresholdRule(ruleType);
  const alertSuppressionUpsellingMessage = useUpsellingMessage('alert_suppression_rule_form');
  const { getFields, reset, setFieldValue } = form;
  const {
    timelinePrivileges: { read: canAttachTimelineTemplates },
  } = useUserPrivileges();

  // Callback for when user toggles between Data Views and Index Patterns
  const onChangeDataSource = useCallback(
    (optionId: string) => {
      form.setFieldValue('dataSourceType', optionId);
      form.getFields().index.reset({
        resetValue: false,
      });
      form.getFields().dataViewId.reset({
        resetValue: false,
      });
    },
    [form]
  );

  const termsAggregationFields = useTermsAggregationFields(indexPattern.fields);
  const termsAggregationFieldNames = useMemo(
    () => termsAggregationFields.map((field) => field.name),
    [termsAggregationFields]
  );

  const [threatIndexPatternsLoading, { indexPatterns: threatIndexPatterns }] =
    useFetchIndex(threatIndex);

  // reset form when rule type changes
  useEffect(() => {
    reset({ resetValues: false });
  }, [reset, ruleType]);

  useEffect(() => {
    setIndexModified(!isEqual(index, indicesConfig));
  }, [index, indicesConfig]);

  const { setPersistentEqlQuery, setPersistentEqlOptions } = usePersistentQuery({
    form,
  });
  usePersistentAlertSuppressionState({ form });
  usePersistentThresholdState({ form, ruleTypePath: 'ruleType', thresholdPath: 'threshold' });
  usePersistentMachineLearningState({
    form,
    ruleTypePath: 'ruleType',
    machineLearningJobIdPath: 'machineLearningJobId',
    anomalyThresholdPath: 'anomalyThreshold',
  });
  usePersistentNewTermsState({
    form,
    ruleTypePath: 'ruleType',
    newTermsFieldsPath: 'newTermsFields',
    historyWindowStartPath: 'historyWindowSize',
  });
  usePersistentThreatMatchState({ form });

  const handleSetRuleFromTimeline = useCallback<SetRuleQuery>(
    ({ index: timelineIndex, queryBar: timelineQueryBar, eqlOptions }) => {
      const setQuery = () => {
        setFieldValue('index', timelineIndex);
        setFieldValue('queryBar', timelineQueryBar);
      };
      if (timelineQueryBar.query.language === 'eql') {
        setFieldValue('ruleType', 'eql');

        // Rule type change takes as minimum two re-renders. Since we render a specific
        // query editor component depending on rule type we need to first render
        // the rule type specific query editor component (using UseField under the hood) to
        // be able to set query's field value.
        //
        // setTimeout provides a simple solution to wait until the rule type specific query
        // editor component is rendered.
        setTimeout(() => {
          setPersistentEqlQuery(timelineQueryBar);
          setPersistentEqlOptions(eqlOptions ?? {});
          setQuery();
          setFieldValue('eqlOptions', eqlOptions ?? {});
        });
      } else {
        setQuery();
      }
    },
    [setFieldValue, setPersistentEqlQuery, setPersistentEqlOptions]
  );

  const { onOpenTimeline, loading: timelineQueryLoading } =
    useRuleFromTimeline(handleSetRuleFromTimeline);

  // if saved query failed to load:
  // - reset shouldLoadFormDynamically to false, as non existent query cannot be used for loading and execution
  const handleSavedQueryError = useCallback(() => {
    if (!isQueryBarValid) {
      form.setFieldValue('shouldLoadQueryDynamically', false);
    }
  }, [isQueryBarValid, form]);

  const handleResetIndices = useCallback(() => {
    const indexField = getFields().index;
    indexField.setValue(indicesConfig);
  }, [getFields, indicesConfig]);

  const handleOpenTimelineSearch = useCallback(() => {
    setOpenTimelineSearch(true);
  }, []);

  const handleCloseTimelineSearch = useCallback(() => {
    setOpenTimelineSearch(false);
  }, []);

  const { fields: esqlSuppressionFields, isLoading: isEsqlSuppressionLoading } =
    useAllEsqlRuleFields({
      esqlQuery: isEsqlRule(ruleType) ? (queryBar?.query?.query as string) : undefined,
      indexPatternsFields: indexPattern.fields,
    });

  /** Suppression fields being selected is a special case for our form logic, as we can't
   * disable these fields and leave users in a bad state that they cannot change.
   * The exception is threshold rules, which use an existing threshold field for the same
   * purpose and so are treated as if the field is always selected.  */
  const areSuppressionFieldsSelected = isThresholdRule || Boolean(alertSuppressionFields?.length);

  const { isSuppressionEnabled: isAlertSuppressionEnabled } = useAlertSuppression(ruleType);

  /** If we don't have ML field information, users can't meaningfully interact with suppression fields */
  const areSuppressionFieldsDisabledByMlFields =
    isMlRule(ruleType) && (mlRuleConfigLoading || !mlSuppressionFields.length);

  /** Suppression fields are generally disabled if either:
   * - License is insufficient (i.e. less than platinum)
   * - ML Field information is not available
   */
  const areSuppressionFieldsDisabled =
    !isAlertSuppressionLicenseValid || areSuppressionFieldsDisabledByMlFields;

  const isSuppressionGroupByDisabled =
    (areSuppressionFieldsDisabled || isEsqlSuppressionLoading) && !areSuppressionFieldsSelected;

  const suppressionGroupByDisabledText = useMemo(() => {
    if (areSuppressionFieldsDisabledByMlFields) {
      return i18n.MACHINE_LEARNING_SUPPRESSION_DISABLED_LABEL;
    } else {
      return alertSuppressionUpsellingMessage;
    }
  }, [alertSuppressionUpsellingMessage, areSuppressionFieldsDisabledByMlFields]);

  const suppressionGroupByFields = useMemo(() => {
    if (isEsqlRule(ruleType)) {
      return esqlSuppressionFields;
    } else if (isMlRule(ruleType)) {
      return mlSuppressionFields;
    } else {
      return termsAggregationFields;
    }
  }, [esqlSuppressionFields, mlSuppressionFields, ruleType, termsAggregationFields]);

  const alertSuppressionFieldsAppendText = useMemo(
    () => (
      <EuiText color="subdued" size="xs">
        {isSuppressionRuleInGA(ruleType)
          ? i18n.ALERT_SUPPRESSION_FIELDS_GA_LABEL_APPEND
          : i18n.ALERT_SUPPRESSION_FIELDS_TECH_PREVIEW_LABEL_APPEND}
      </EuiText>
    ),
    [ruleType]
  );

  const dataViewIndexPatternToggleButtonOptions: EuiButtonGroupOptionProps[] = useMemo(
    () => [
      {
        id: DataSourceType.IndexPatterns,
        label: i18nCore.translate(
          'xpack.securitySolution.ruleDefine.indexTypeSelect.indexPattern',
          {
            defaultMessage: 'Index Patterns',
          }
        ),
        iconType: dataSourceType === DataSourceType.IndexPatterns ? 'checkCircleFill' : 'empty',
        'data-test-subj': `rule-index-toggle-${DataSourceType.IndexPatterns}`,
      },
      {
        id: DataSourceType.DataView,
        label: i18nCore.translate('xpack.securitySolution.ruleDefine.indexTypeSelect.dataView', {
          defaultMessage: 'Data View',
        }),
        iconType: dataSourceType === DataSourceType.DataView ? 'checkCircleFill' : 'empty',
        'data-test-subj': `rule-index-toggle-${DataSourceType.DataView}`,
      },
    ],
    [dataSourceType]
  );

  const DataSource = useMemo(() => {
    return (
      <RuleTypeEuiFormRow label={i18n.SOURCE} $isVisible={true} fullWidth>
        <EuiFlexGroup
          direction="column"
          gutterSize="s"
          data-test-subj="dataViewIndexPatternButtonGroupFlexGroup"
        >
          <EuiFlexItem>
            <EuiText size="xs">
              <FormattedMessage
                id="xpack.securitySolution.dataViewSelectorText1"
                defaultMessage="Use Kibana "
              />
              <DocLink
                docPath="explore-analyze/find-and-organize/data-views"
                linkText="Data Views"
              />
              <FormattedMessage
                id="xpack.securitySolution.dataViewSelectorText2"
                defaultMessage=" or specify individual "
              />
              <DocLink
                docPath="api/doc/kibana/group/endpoint-data-views"
                linkText="index patterns"
              />
              <FormattedMessage
                id="xpack.securitySolution.dataViewSelectorText3"
                defaultMessage=" as your rule's data source to be searched."
              />
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <RuleTypeEuiFormRow $isVisible={true}>
              <EuiButtonGroup
                isFullWidth={true}
                legend="Rule index pattern or data view selector"
                data-test-subj="dataViewIndexPatternButtonGroup"
                idSelected={dataSourceType}
                onChange={onChangeDataSource}
                options={dataViewIndexPatternToggleButtonOptions}
                color="primary"
              />
            </RuleTypeEuiFormRow>
          </EuiFlexItem>

          <EuiFlexItem>
            <StyledVisibleContainer isVisible={dataSourceType === DataSourceType.DataView}>
              <UseField
                key="DataViewSelector"
                path="dataViewId"
                component={DataViewSelectorField}
              />
            </StyledVisibleContainer>
            <StyledVisibleContainer isVisible={dataSourceType === DataSourceType.IndexPatterns}>
              <CommonUseField
                path="index"
                config={{
                  ...schema.index,
                  labelAppend: indexModified ? (
                    <MyLabelButton onClick={handleResetIndices} iconType="refresh">
                      {i18n.RESET_DEFAULT_INDEX}
                    </MyLabelButton>
                  ) : null,
                }}
                componentProps={{
                  idAria: 'detectionEngineStepDefineRuleIndices',
                  'data-test-subj': 'detectionEngineStepDefineRuleIndices',
                  euiFieldProps: {
                    fullWidth: true,
                    placeholder: '',
                    isDisabled: timelineQueryLoading,
                    isLoading: timelineQueryLoading,
                  },
                }}
              />
            </StyledVisibleContainer>
          </EuiFlexItem>
        </EuiFlexGroup>
      </RuleTypeEuiFormRow>
    );
  }, [
    timelineQueryLoading,
    dataSourceType,
    onChangeDataSource,
    dataViewIndexPatternToggleButtonOptions,
    indexModified,
    handleResetIndices,
  ]);

  const QueryBarMemo = useMemo(
    () => (
      <UseField
        key="QueryBarDefineRule"
        path="queryBar"
        config={{
          ...schema.queryBar,
          label: i18n.QUERY_BAR_LABEL,
          labelAppend: (
            <MyLabelButton
              data-test-subj="importQueryFromSavedTimeline"
              onClick={handleOpenTimelineSearch}
              disabled={shouldLoadQueryDynamically}
            >
              {i18n.IMPORT_TIMELINE_QUERY}
            </MyLabelButton>
          ),
        }}
        component={QueryBarField}
        componentProps={
          {
            idAria: 'detectionEngineStepDefineRuleQueryBar',
            indexPattern,
            isDisabled: isLoading || shouldLoadQueryDynamically || timelineQueryLoading,
            resetToSavedQuery: shouldLoadQueryDynamically,
            isLoading: isIndexPatternLoading || timelineQueryLoading,
            dataTestSubj: 'detectionEngineStepDefineRuleQueryBar',
            openTimelineSearch,
            onValidityChange: setIsQueryBarValid,
            onCloseTimelineSearch: handleCloseTimelineSearch,
            onSavedQueryError: handleSavedQueryError,
            defaultSavedQuery,
            onOpenTimeline,
            bubbleSubmitEvent: true,
          } as QueryBarFieldProps
        }
      />
    ),
    [
      handleOpenTimelineSearch,
      shouldLoadQueryDynamically,
      indexPattern,
      isLoading,
      timelineQueryLoading,
      isIndexPatternLoading,
      openTimelineSearch,
      setIsQueryBarValid,
      handleCloseTimelineSearch,
      handleSavedQueryError,
      defaultSavedQuery,
      onOpenTimeline,
    ]
  );

  const { http, application } = useKibana().services;

  const handleNavigateToV2 = useCallback(
    (v2Type: 'esql' | 'threshold') => {
      const url = http.basePath.prepend(
        `/app/security/rules_v2/create?type=${v2Type}&returnTo=rules`
      );
      application.navigateToUrl(url);
    },
    [http.basePath, application]
  );

  const selectRuleTypeProps = useMemo(
    () => ({
      describedByIds: ['detectionEngineStepDefineRuleType'],
      isUpdateView,
      hasValidLicense: hasMlLicense,
      isMlAdmin: hasMlAdminPermissions,
      onNavigateToV2: handleNavigateToV2,
    }),
    [hasMlAdminPermissions, hasMlLicense, isUpdateView, handleNavigateToV2]
  );

  return (
    <>
      <StepContentWrapper addPadding={!isUpdateView}>
        <Form form={form} data-test-subj="stepDefineRule">
          <UseField
            path="dataSourceType"
            component={HiddenField}
            componentProps={{
              euiFieldProps: {
                fullWidth: true,
                placeholder: '',
              },
            }}
          />
          <UseField
            path="ruleType"
            component={SelectRuleType}
            componentProps={selectRuleTypeProps}
          />
          <RuleTypeEuiFormRow $isVisible={!isMlRule(ruleType) && !isEsqlRule(ruleType)} fullWidth>
            <>
              <EuiSpacer size="s" />
              {DataSource}
            </>
          </RuleTypeEuiFormRow>
          <RuleTypeEuiFormRow
            $isVisible={!isMlRule(ruleType)}
            fullWidth
            data-test-subj="defineRuleFormStepQueryEditor"
          >
            <>
              <EuiSpacer size="s" />
              {isEqlRule(ruleType) ? (
                <EqlQueryEdit
                  path="queryBar"
                  eqlOptionsPath="eqlOptions"
                  fieldsToValidateOnChange={ALERT_SUPPRESSION_FIELDS_FIELD_NAME}
                  required
                  showFilterBar
                  dataView={indexPattern}
                  loading={isIndexPatternLoading}
                  disabled={isLoading}
                  onValidityChange={setIsQueryBarValid}
                />
              ) : isEsqlRule(ruleType) ? (
                <EsqlQueryEdit
                  path="queryBar"
                  fieldsToValidateOnChange={ALERT_SUPPRESSION_FIELDS_FIELD_NAME}
                  required
                  dataView={indexPattern}
                  disabled={isLoading}
                  loading={isLoading}
                  onValidityChange={setIsQueryBarValid}
                />
              ) : (
                QueryBarMemo
              )}
            </>
          </RuleTypeEuiFormRow>
          {!isMlRule(ruleType) && !isQueryBarValid && queryBar?.query?.query && (
            <AiAssistant
              getFields={form.getFields}
              setFieldValue={form.setFieldValue}
              language={queryBar?.query?.language}
            />
          )}
          {isQueryRule(ruleType) && (
            <>
              <EuiSpacer size="s" />
              <RuleTypeEuiFormRow
                label={i18n.SAVED_QUERY_FORM_ROW_LABEL}
                $isVisible={Boolean(queryBarSavedId)}
                fullWidth
              >
                <CommonUseField
                  path="shouldLoadQueryDynamically"
                  componentProps={{
                    idAria: 'detectionEngineStepDefineRuleShouldLoadQueryDynamically',
                    'data-test-subj': 'detectionEngineStepDefineRuleShouldLoadQueryDynamically',
                    euiFieldProps: {
                      disabled: isLoading,
                      label: queryBarTitle
                        ? i18n.getSavedQueryCheckboxLabel(queryBarTitle)
                        : i18n.getSavedQueryCheckboxLabelWithoutName(),
                    },
                  }}
                />
              </RuleTypeEuiFormRow>
            </>
          )}
          {isMlRule(ruleType) && (
            <EuiFormRow fullWidth>
              <>
                <EuiFlexGroup>
                  <EuiFlexItem grow={false}>
                    <MachineLearningJobIdEdit path="machineLearningJobId" />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiSpacer size="xs" />
                    <EuiSpacer size="m" />
                    <CreateCustomMlJobButton />
                  </EuiFlexItem>
                </EuiFlexGroup>
                <AnomalyThresholdEdit path="anomalyThreshold" />
              </>
            </EuiFormRow>
          )}
          {isThresholdRule && (
            <EuiFormRow data-test-subj="thresholdInput" fullWidth>
              <ThresholdEdit esFields={indexPattern.fields as FieldSpec[]} path="threshold" />
            </EuiFormRow>
          )}
          {isThreatMatchRule(ruleType) && (
            <ThreatMatchEdit
              indexPatternPath="threatIndex"
              queryPath="threatQueryBar"
              mappingPath="threatMapping"
              indexPatterns={indexPattern}
              threatIndexPatterns={threatIndexPatterns}
              loading={threatIndexPatternsLoading}
            />
          )}
          {isNewTermsRule(ruleType) && (
            <EuiFormRow data-test-subj="newTermsInput" fullWidth>
              <>
                <NewTermsFieldsEdit path="newTermsFields" fieldNames={termsAggregationFieldNames} />
                <HistoryWindowStartEdit path="historyWindowSize" />
              </>
            </EuiFormRow>
          )}
          <EuiSpacer size="m" />

          <RuleTypeEuiFormRow $isVisible={isAlertSuppressionEnabled} fullWidth>
            {isThresholdRule ? (
              <ThresholdAlertSuppressionEdit
                suppressionFieldNames={threshold?.field}
                disabled={!isAlertSuppressionLicenseValid}
                disabledText={alertSuppressionUpsellingMessage}
              />
            ) : (
              <AlertSuppressionEdit
                suppressibleFields={suppressionGroupByFields}
                labelAppend={alertSuppressionFieldsAppendText}
                warningText={
                  isMlSuppressionIncomplete
                    ? i18n.MACHINE_LEARNING_SUPPRESSION_INCOMPLETE_LABEL
                    : undefined
                }
                disabled={isSuppressionGroupByDisabled}
                disabledText={suppressionGroupByDisabledText}
              />
            )}
          </RuleTypeEuiFormRow>
          {!isMlRule(ruleType) && (
            <>
              <RequiredFields
                path="requiredFields"
                indexPatternFields={indexPattern.fields}
                isIndexPatternLoading={isIndexPatternLoading}
              />
              <EuiSpacer size="l" />
            </>
          )}
          <RelatedIntegrations path="relatedIntegrations" dataTestSubj="relatedIntegrations" />
          <UseField
            path="timeline"
            component={PickTimeline}
            componentProps={{
              idAria: 'detectionEngineStepDefineRuleTimeline',
              isDisabled: isLoading || !canAttachTimelineTemplates,
              dataTestSubj: 'detectionEngineStepDefineRuleTimeline',
            }}
          />
        </Form>
      </StepContentWrapper>
    </>
  );
};
export const StepDefineRule = memo(StepDefineRuleComponent);

const StepDefineRuleReadOnlyComponent: FC<StepDefineRuleReadOnlyProps> = ({
  addPadding,
  defaultValues: data,
  descriptionColumns,
  indexPattern,
}) => {
  const dataForDescription: Partial<DefineStepRule> = getStepDataDataSource(data);
  const transformFields = useExperimentalFeatureFieldsTransform();
  const fieldsToDisplay = transformFields(dataForDescription);

  return (
    <StepContentWrapper data-test-subj="definitionRule" addPadding={addPadding}>
      <StepRuleDescription
        columns={descriptionColumns}
        schema={filterRuleFieldsForType(schema, data.ruleType)}
        data={filterRuleFieldsForType(fieldsToDisplay, data.ruleType)}
        indexPatterns={indexPattern}
      />
    </StepContentWrapper>
  );
};
export const StepDefineRuleReadOnly = memo(StepDefineRuleReadOnlyComponent);
