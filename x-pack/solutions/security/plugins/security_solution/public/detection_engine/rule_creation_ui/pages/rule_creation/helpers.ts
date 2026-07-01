/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable complexity */

import { has, isEmpty, get } from 'lodash/fp';
import type { Unit } from '@kbn/datemath';
import deepmerge from 'deepmerge';
import { omit } from 'lodash';

import type {
  ExceptionListType,
  NamespaceType,
  List,
} from '@kbn/securitysolution-io-ts-list-types';
import type {
  RiskScoreMappingItem,
  Threats,
  ThreatSubtechnique,
  ThreatTechnique,
  Type,
} from '@kbn/securitysolution-io-ts-alerting-types';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import type {
  RuleAction as AlertingRuleAction,
  RuleSystemAction as AlertingRuleSystemAction,
} from '@kbn/alerting-plugin/common';

import type { ActionTypeRegistryContract } from '@kbn/triggers-actions-ui-plugin/public';

import { TimeDuration, getTimeDurationUnit } from '@kbn/securitysolution-utils/time_duration';
import { assertUnreachable } from '../../../../../common/utility_types';
import {
  transformAlertToRuleAction,
  transformAlertToRuleResponseAction,
  transformAlertToRuleSystemAction,
} from '../../../../../common/detection_engine/transform_actions';

import type {
  AboutStepRule,
  DefineStepRule,
  ScheduleStepRule,
  ActionsStepRule,
  DefineStepRuleJson,
  ScheduleStepRuleJson,
  AboutStepRuleJson,
  ActionsStepRuleJson,
} from '../../../common/types';
import { DataSourceType, AlertSuppressionDurationType } from '../../../common/types';
import type {
  RuleCreateProps,
  AlertSuppression,
  RequiredFieldInput,
  SeverityMapping,
  RelatedIntegrationArray,
} from '../../../../../common/api/detection_engine/model/rule_schema';
import { stepActionsDefaultValue } from '../../../rule_creation/components/step_rule_actions';
import { DEFAULT_SUPPRESSION_MISSING_FIELDS_STRATEGY } from '../../../../../common/detection_engine/constants';
import {
  ALERT_SUPPRESSION_DURATION_FIELD_NAME,
  ALERT_SUPPRESSION_DURATION_TYPE_FIELD_NAME,
  ALERT_SUPPRESSION_FIELDS_FIELD_NAME,
  ALERT_SUPPRESSION_MISSING_FIELDS_FIELD_NAME,
} from '../../../rule_creation/components/alert_suppression_edit';
import { THRESHOLD_ALERT_SUPPRESSION_ENABLED } from '../../../rule_creation/components/threshold_alert_suppression_edit';
import { convertDurationToDateMath } from '../../../../common/utils/date_math';

export const getTimeTypeValue = (time: string): { unit: Unit; value: number } => {
  const timeObj: { unit: Unit; value: number } = {
    unit: 'ms',
    value: 0,
  };
  const filterTimeVal = time.match(/\d+/g);
  const filterTimeType = time.match(/[a-zA-Z]+/g);
  if (!isEmpty(filterTimeVal) && filterTimeVal != null && !isNaN(Number(filterTimeVal[0]))) {
    timeObj.value = Number(filterTimeVal[0]);
  }
  if (
    !isEmpty(filterTimeType) &&
    filterTimeType != null &&
    ['s', 'm', 'h', 'd'].includes(filterTimeType[0])
  ) {
    timeObj.unit = filterTimeType[0] as Unit;
  }
  return timeObj;
};

export interface RuleFields {
  anomalyThreshold: unknown;
  machineLearningJobId: unknown;
  queryBar: unknown;
  index: unknown;
  dataViewId?: unknown;
  ruleType: unknown;
  threshold?: unknown;
  threatIndex?: unknown;
  threatQueryBar?: unknown;
  threatMapping?: unknown;
  threatLanguage?: unknown;
  eqlOptions: unknown;
  newTermsFields?: unknown;
  historyWindowSize?: unknown;
}

type QueryRuleFields<T> = Omit<
  T,
  | 'anomalyThreshold'
  | 'machineLearningJobId'
  | 'threshold'
  | 'threatIndex'
  | 'threatQueryBar'
  | 'threatMapping'
  | 'eqlOptions'
  | 'newTermsFields'
  | 'historyWindowSize'
>;
type EqlQueryRuleFields<T> = Omit<
  T,
  | 'anomalyThreshold'
  | 'machineLearningJobId'
  | 'threshold'
  | 'threatIndex'
  | 'threatQueryBar'
  | 'threatMapping'
  | 'newTermsFields'
  | 'historyWindowSize'
>;
type ThresholdRuleFields<T> = Omit<
  T,
  | 'anomalyThreshold'
  | 'machineLearningJobId'
  | 'threatIndex'
  | 'threatQueryBar'
  | 'threatMapping'
  | 'eqlOptions'
  | 'newTermsFields'
  | 'historyWindowSize'
>;
type MlRuleFields<T> = Omit<
  T,
  | 'queryBar'
  | 'index'
  | 'threshold'
  | 'threatIndex'
  | 'threatQueryBar'
  | 'threatMapping'
  | 'eqlOptions'
  | 'newTermsFields'
  | 'historyWindowSize'
>;
type ThreatMatchRuleFields<T> = Omit<
  T,
  | 'anomalyThreshold'
  | 'machineLearningJobId'
  | 'threshold'
  | 'eqlOptions'
  | 'newTermsFields'
  | 'historyWindowSize'
>;
type NewTermsRuleFields<T> = Omit<
  T,
  | 'anomalyThreshold'
  | 'machineLearningJobId'
  | 'threshold'
  | 'threatIndex'
  | 'threatQueryBar'
  | 'threatMapping'
  | 'eqlOptions'
>;
type EsqlRuleFields<T> = Omit<
  T,
  | 'anomalyThreshold'
  | 'machineLearningJobId'
  | 'threshold'
  | 'threatIndex'
  | 'threatQueryBar'
  | 'threatMapping'
  | 'eqlOptions'
  | 'index'
  | 'newTermsFields'
  | 'historyWindowSize'
  | 'dataViewId'
>;

const isMlFields = <T>(
  fields:
    | QueryRuleFields<T>
    | EqlQueryRuleFields<T>
    | MlRuleFields<T>
    | ThresholdRuleFields<T>
    | ThreatMatchRuleFields<T>
    | NewTermsRuleFields<T>
    | EsqlRuleFields<T>
): fields is MlRuleFields<T> => has('anomalyThreshold', fields);

const isThresholdFields = <T>(
  fields:
    | QueryRuleFields<T>
    | EqlQueryRuleFields<T>
    | MlRuleFields<T>
    | ThresholdRuleFields<T>
    | ThreatMatchRuleFields<T>
    | NewTermsRuleFields<T>
    | EsqlRuleFields<T>
): fields is ThresholdRuleFields<T> => has('threshold', fields);

const isThreatMatchFields = <T>(
  fields:
    | QueryRuleFields<T>
    | EqlQueryRuleFields<T>
    | MlRuleFields<T>
    | ThresholdRuleFields<T>
    | ThreatMatchRuleFields<T>
    | NewTermsRuleFields<T>
    | EsqlRuleFields<T>
): fields is ThreatMatchRuleFields<T> => has('threatIndex', fields);

const isNewTermsFields = <T>(
  fields:
    | QueryRuleFields<T>
    | EqlQueryRuleFields<T>
    | MlRuleFields<T>
    | ThresholdRuleFields<T>
    | ThreatMatchRuleFields<T>
    | NewTermsRuleFields<T>
    | EsqlRuleFields<T>
): fields is NewTermsRuleFields<T> => has('newTermsFields', fields);

const isEqlFields = <T>(
  fields:
    | QueryRuleFields<T>
    | EqlQueryRuleFields<T>
    | MlRuleFields<T>
    | ThresholdRuleFields<T>
    | ThreatMatchRuleFields<T>
    | NewTermsRuleFields<T>
    | EsqlRuleFields<T>
): fields is EqlQueryRuleFields<T> => has('eqlOptions', fields);

const isEsqlFields = <T>(
  fields:
    | QueryRuleFields<T>
    | EqlQueryRuleFields<T>
    | MlRuleFields<T>
    | ThresholdRuleFields<T>
    | ThreatMatchRuleFields<T>
    | NewTermsRuleFields<T>
    | EsqlRuleFields<T>
): fields is EsqlRuleFields<T> => get('queryBar.query.language', fields) === 'esql';

export const filterRuleFieldsForType = <T extends Partial<RuleFields>>(
  fields: T,
  type: Type
):
  | QueryRuleFields<T>
  | EqlQueryRuleFields<T>
  | MlRuleFields<T>
  | ThresholdRuleFields<T>
  | ThreatMatchRuleFields<T>
  | EsqlRuleFields<T>
  | NewTermsRuleFields<T> => {
  switch (type) {
    case 'machine_learning':
      return omit(fields, [
        'index',
        'queryBar',
        'threshold',
        'threatIndex',
        'threatQueryBar',
        'threatMapping',
        'eqlOptions',
        'newTermsFields',
        'historyWindowSize',
      ]);
    case 'threshold':
      return omit(fields, [
        'anomalyThreshold',
        'machineLearningJobId',
        'threatIndex',
        'threatQueryBar',
        'threatMapping',
        'eqlOptions',
        'newTermsFields',
        'historyWindowSize',
      ]);
    case 'threat_match':
      return omit(fields, [
        'anomalyThreshold',
        'machineLearningJobId',
        'threshold',
        'eqlOptions',
        'newTermsFields',
        'historyWindowSize',
      ]);
    case 'query':
    case 'saved_query':
      return omit(fields, [
        'anomalyThreshold',
        'machineLearningJobId',
        'threshold',
        'threatIndex',
        'threatQueryBar',
        'threatMapping',
        'eqlOptions',
        'newTermsFields',
        'historyWindowSize',
      ]);
    case 'eql':
      return omit(fields, [
        'anomalyThreshold',
        'machineLearningJobId',
        'threshold',
        'threatIndex',
        'threatQueryBar',
        'threatMapping',
        'newTermsFields',
        'historyWindowSize',
      ]);
    case 'new_terms':
      return omit(fields, [
        'anomalyThreshold',
        'machineLearningJobId',
        'threshold',
        'threatIndex',
        'threatQueryBar',
        'threatMapping',
        'eqlOptions',
      ]);
    case 'esql':
      return omit(fields, [
        'anomalyThreshold',
        'machineLearningJobId',
        'threshold',
        'threatIndex',
        'threatQueryBar',
        'threatMapping',
        'newTermsFields',
        'historyWindowSize',
        'eqlOptions',
        'index',
        'dataViewId',
      ]);
  }
  assertUnreachable(type);
};

function trimThreatsWithNoName<T extends ThreatSubtechnique | ThreatTechnique>(
  filterable: T[]
): T[] {
  return filterable.filter((item) => item.name !== 'none');
}

/**
 * Filter out unfilled/empty threat, technique, and subtechnique fields based on if their name is `none`
 */
export const filterEmptyThreats = (threats: Threats): Threats => {
  return threats
    .filter((singleThreat) => singleThreat.tactic.name !== 'none')
    .map((threat) => {
      return {
        ...threat,
        technique: trimThreatsWithNoName(threat.technique ?? []).map((technique) => {
          return {
            ...technique,
            subtechnique:
              technique.subtechnique != null
                ? trimThreatsWithNoName(technique.subtechnique)
                : undefined,
          };
        }),
      };
    });
};

/**
 * remove unused data source.
 * Ex: rule is using a data view so we should not
 * write an index property on the rule form.
 * @param defineStepData
 * @returns DefineStepRule
 */
export const getStepDataDataSource = (
  defineStepData: DefineStepRule
): Omit<DefineStepRule, 'dataViewId' | 'index' | 'dataSourceType'> & {
  index?: string[];
  dataViewId?: string;
} => {
  const copiedStepData = { ...defineStepData };
  if (defineStepData.dataSourceType === DataSourceType.DataView) {
    return omit(copiedStepData, ['index', 'dataSourceType']);
  } else if (defineStepData.dataSourceType === DataSourceType.IndexPatterns) {
    return omit(copiedStepData, ['dataViewId', 'dataSourceType']);
  }
  return copiedStepData;
};

/**
 * Strips away form rows that were not filled out by the user
 */
export const removeEmptyRequiredFields = (
  requiredFields: RequiredFieldInput[]
): RequiredFieldInput[] => requiredFields.filter((field) => field.name !== '' && field.type !== '');

export const formatDefineStepData = (defineStepData: DefineStepRule): DefineStepRuleJson => {
  const stepData = getStepDataDataSource(defineStepData);

  const ruleFields = filterRuleFieldsForType(stepData, stepData.ruleType);
  const { ruleType, timeline } = ruleFields;

  const baseFields = {
    type: ruleType,
    related_integrations: defineStepData.relatedIntegrations
      ? filterOutEmptyRelatedIntegrations(defineStepData.relatedIntegrations)
      : undefined,
    ...(timeline.id != null &&
      timeline.title != null && {
        timeline_id: timeline.id,
        timeline_title: timeline.title,
      }),
  };

  // Threshold rule won't contain alert suppression fields
  const alertSuppressionFields =
    ruleFields[ALERT_SUPPRESSION_FIELDS_FIELD_NAME]?.length > 0
      ? {
          alert_suppression: {
            group_by: ruleFields[ALERT_SUPPRESSION_FIELDS_FIELD_NAME],
            duration:
              ruleFields[ALERT_SUPPRESSION_DURATION_TYPE_FIELD_NAME] ===
              AlertSuppressionDurationType.PerTimePeriod
                ? ruleFields[ALERT_SUPPRESSION_DURATION_FIELD_NAME]
                : undefined,
            missing_fields_strategy: (ruleFields[ALERT_SUPPRESSION_MISSING_FIELDS_FIELD_NAME] ||
              DEFAULT_SUPPRESSION_MISSING_FIELDS_STRATEGY) as AlertSuppression['missing_fields_strategy'],
          },
        }
      : {};

  const requiredFields = removeEmptyRequiredFields(defineStepData.requiredFields ?? []);

  const typeFields = isMlFields(ruleFields)
    ? {
        anomaly_threshold: ruleFields.anomalyThreshold,
        machine_learning_job_id: ruleFields.machineLearningJobId,
        ...alertSuppressionFields,
      }
    : isThresholdFields(ruleFields)
    ? {
        index: ruleFields.index,
        filters: ruleFields.queryBar?.filters,
        language: ruleFields.queryBar?.query?.language,
        query: ruleFields.queryBar?.query?.query as string,
        saved_id: ruleFields.queryBar?.saved_id ?? undefined,
        required_fields: requiredFields,
        ...(ruleType === 'threshold' && {
          threshold: {
            field: ruleFields.threshold?.field ?? [],
            value: parseInt(ruleFields.threshold?.value, 10) ?? 0,
            cardinality:
              !isEmpty(ruleFields.threshold.cardinality?.field) &&
              ruleFields.threshold.cardinality?.value != null
                ? [
                    {
                      field: ruleFields.threshold.cardinality.field[0],
                      value: parseInt(ruleFields.threshold.cardinality.value, 10),
                    },
                  ]
                : [],
          },
          ...(ruleFields[THRESHOLD_ALERT_SUPPRESSION_ENABLED] && {
            alert_suppression: { duration: ruleFields[ALERT_SUPPRESSION_DURATION_FIELD_NAME] },
          }),
        }),
      }
    : isThreatMatchFields(ruleFields)
    ? {
        index: ruleFields.index,
        filters: ruleFields.queryBar?.filters,
        language: ruleFields.queryBar?.query?.language,
        query: ruleFields.queryBar?.query?.query as string,
        saved_id: ruleFields.queryBar?.saved_id ?? undefined,
        required_fields: requiredFields,
        threat_index: ruleFields.threatIndex,
        threat_query: ruleFields.threatQueryBar?.query?.query as string,
        threat_filters: ruleFields.threatQueryBar?.filters,
        threat_mapping: ruleFields.threatMapping,
        threat_language: ruleFields.threatQueryBar?.query?.language,
        ...alertSuppressionFields,
      }
    : isEqlFields(ruleFields)
    ? {
        index: ruleFields.index,
        filters: ruleFields.queryBar?.filters,
        language: ruleFields.queryBar?.query?.language,
        query: ruleFields.queryBar?.query?.query as string,
        saved_id: ruleFields.queryBar?.saved_id ?? undefined,
        required_fields: requiredFields,
        timestamp_field: ruleFields.eqlOptions?.timestampField,
        event_category_override: ruleFields.eqlOptions?.eventCategoryField,
        tiebreaker_field: ruleFields.eqlOptions?.tiebreakerField,
        ...alertSuppressionFields,
      }
    : isNewTermsFields(ruleFields)
    ? {
        index: ruleFields.index,
        filters: ruleFields.queryBar?.filters,
        language: ruleFields.queryBar?.query?.language,
        query: ruleFields.queryBar?.query?.query as string,
        required_fields: requiredFields,
        new_terms_fields: ruleFields.newTermsFields,
        history_window_start: convertDurationToDateMath(ruleFields.historyWindowSize),
        ...alertSuppressionFields,
      }
    : isEsqlFields(ruleFields) && !('index' in ruleFields)
    ? {
        language: ruleFields.queryBar?.query?.language,
        query: ruleFields.queryBar?.query?.query as string,
        required_fields: requiredFields,
        ...alertSuppressionFields,
      }
    : {
        ...alertSuppressionFields,
        index: ruleFields.index,
        filters: ruleFields.queryBar?.filters,
        language: ruleFields.queryBar?.query?.language,
        query: ruleFields.queryBar?.query?.query as string,
        saved_id: undefined,
        required_fields: requiredFields,
        type: 'query' as const,
        // rule only be updated as saved_query type if it has saved_id and shouldLoadQueryDynamically checkbox checked
        ...(['query', 'saved_query'].includes(ruleType) &&
          ruleFields.queryBar?.saved_id &&
          ruleFields.shouldLoadQueryDynamically && {
            type: 'saved_query' as const,
            query: undefined,
            filters: undefined,
            saved_id: ruleFields.queryBar.saved_id,
          }),
      };

  return {
    ...baseFields,
    ...typeFields,
    ...('dataViewId' in ruleFields ? { data_view_id: ruleFields.dataViewId } : {}),
  };
};

export const formatScheduleStepData = (scheduleData: ScheduleStepRule): ScheduleStepRuleJson => {
  const { ...formatScheduleData } = scheduleData;

  const interval = TimeDuration.parse(formatScheduleData.interval ?? '');
  const lookBack = TimeDuration.parse(formatScheduleData.from ?? '');

  if (interval !== undefined && lookBack !== undefined) {
    // Preserve the unit entered by the user (the `from` field holds the raw
    // look-back string here) so the chosen format isn't normalized away.
    const lookBackUnit = getTimeDurationUnit(formatScheduleData.from ?? '');
    const fromOffset = TimeDuration.fromMilliseconds(
      interval.toMilliseconds() + lookBack.toMilliseconds(),
      lookBackUnit
    ).toString();

    formatScheduleData.from = `now-${fromOffset}`;
    formatScheduleData.to = 'now';
  }

  return formatScheduleData;
};

export const formatAboutStepData = (
  aboutStepData: AboutStepRule,
  exceptionsList?: List[]
): AboutStepRuleJson => {
  const {
    author,
    falsePositives,
    investigationFields,
    references,
    riskScore,
    severity,
    threat,
    isAssociatedToEndpointList,
    isBuildingBlock,
    maxSignals,
    note,
    ruleNameOverride,
    threatIndicatorPath,
    timestampOverride,
    timestampOverrideFallbackDisabled,
    ...rest
  } = aboutStepData;

  const detectionExceptionLists =
    exceptionsList != null ? exceptionsList.filter((list) => list.type !== 'endpoint') : [];
  const isinvestigationFieldsEmpty = investigationFields.every((item) => isEmpty(item.trim()));

  const resp = {
    author: author.filter((item) => !isEmpty(item)),
    ...(isBuildingBlock ? { building_block_type: 'default' } : {}),
    ...(isAssociatedToEndpointList
      ? {
          exceptions_list: [
            {
              id: ENDPOINT_ARTIFACT_LISTS.endpointExceptions.id,
              list_id: ENDPOINT_ARTIFACT_LISTS.endpointExceptions.id,
              namespace_type: 'agnostic' as NamespaceType,
              type: 'endpoint' as ExceptionListType,
            },
            ...detectionExceptionLists,
          ],
        }
      : exceptionsList != null
      ? {
          exceptions_list: [...detectionExceptionLists],
        }
      : {}),
    false_positives: falsePositives.filter((item) => !isEmpty(item)),
    references: references.filter((item) => !isEmpty(item)),
    investigation_fields: isinvestigationFieldsEmpty
      ? undefined
      : { field_names: investigationFields },
    risk_score: riskScore.value,
    risk_score_mapping: riskScore.isMappingChecked
      ? filterOutEmptyRiskScoreMappingItems(riskScore.mapping)
      : [],
    rule_name_override: ruleNameOverride !== '' ? ruleNameOverride : undefined,
    severity: severity.value,
    severity_mapping: severity.isMappingChecked
      ? filterOutEmptySeverityMappingItems(severity.mapping)
      : [],
    threat: filterEmptyThreats(threat).map((singleThreat) => ({
      ...singleThreat,
      framework: 'MITRE ATT&CK',
    })),
    threat_indicator_path: threatIndicatorPath,
    timestamp_override: timestampOverride !== '' ? timestampOverride : undefined,
    timestamp_override_fallback_disabled: timestampOverrideFallbackDisabled,
    ...(!isEmpty(note) ? { note } : {}),
    max_signals: Number.isSafeInteger(maxSignals) ? maxSignals : undefined,
    ...rest,
  };
  return resp;
};

export const filterOutEmptyRiskScoreMappingItems = (riskScoreMapping: RiskScoreMappingItem[]) =>
  riskScoreMapping.filter((m) => m.field != null && m.field !== '');

export const filterOutEmptySeverityMappingItems = (severityMapping: SeverityMapping) =>
  severityMapping.filter((m) => m.field != null && m.field !== '' && m.value != null);

export const filterOutEmptyRelatedIntegrations = (relatedIntegrations: RelatedIntegrationArray) =>
  relatedIntegrations.filter((ri) => !isEmpty(ri.package));

export const isRuleAction = (
  action: AlertingRuleAction | AlertingRuleSystemAction,
  actionTypeRegistry: ActionTypeRegistryContract
): action is AlertingRuleAction => !actionTypeRegistry.get(action.actionTypeId).isSystemActionType;

export const formatActionsStepData = (
  actionsStepData: ActionsStepRule,
  actionTypeRegistry: ActionTypeRegistryContract
): ActionsStepRuleJson => {
  const { actions = [], responseActions, enabled, kibanaSiemAppUrl } = actionsStepData;

  return {
    actions: actions.map((action) =>
      isRuleAction(action, actionTypeRegistry)
        ? transformAlertToRuleAction(action)
        : transformAlertToRuleSystemAction(action)
    ),
    response_actions: responseActions?.map(transformAlertToRuleResponseAction),
    enabled,
    meta: {
      kibana_siem_app_url: kibanaSiemAppUrl,
    },
  };
};

// Used to format form data in rule edit and
// create flows so "T" here would likely
// either be RuleCreateProps or Rule
export const formatRule = <T>(
  defineStepData: DefineStepRule,
  aboutStepData: AboutStepRule,
  scheduleData: ScheduleStepRule,
  actionsData: ActionsStepRule,
  actionTypeRegistry: ActionTypeRegistryContract,
  exceptionsList?: List[]
): T =>
  deepmerge.all([
    formatDefineStepData(defineStepData),
    formatAboutStepData(aboutStepData, exceptionsList),
    formatScheduleStepData(scheduleData),
    formatActionsStepData(actionsData, actionTypeRegistry),
  ]) as unknown as T;

export const formatPreviewRule = ({
  defineRuleData,
  aboutRuleData,
  scheduleRuleData,
  exceptionsList,
  actionTypeRegistry,
}: {
  defineRuleData: DefineStepRule;
  aboutRuleData: AboutStepRule;
  scheduleRuleData: ScheduleStepRule;
  actionTypeRegistry: ActionTypeRegistryContract;
  exceptionsList?: List[];
}): RuleCreateProps => {
  const aboutStepData = {
    ...aboutRuleData,
    name: 'Preview Rule',
    description: 'Preview Rule',
  };
  return {
    ...formatRule<RuleCreateProps>(
      defineRuleData,
      aboutStepData,
      scheduleRuleData,
      stepActionsDefaultValue,
      actionTypeRegistry,
      exceptionsList
    ),
  };
};
