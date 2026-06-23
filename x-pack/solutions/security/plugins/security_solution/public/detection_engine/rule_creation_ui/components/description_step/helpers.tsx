/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiLoadingSpinner,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { ALERT_RISK_SCORE } from '@kbn/rule-data-utils';

import { isEmpty } from 'lodash/fp';
import React from 'react';
import styled from 'styled-components';
import type { Threats, Type } from '@kbn/securitysolution-io-ts-alerting-types';
import { FilterBadgeGroup } from '@kbn/unified-search-plugin/public';
import { constructThreatMappingDescription } from '../../../rule_management/components/rule_details/rule_definition_section';
import { IntervalAbbrScreenReader } from '../../../../common/components/accessibility';
import type {
  AlertSuppressionMissingFieldsStrategy,
  RequiredFieldArray,
  ThreatMapping,
} from '../../../../../common/api/detection_engine/model/rule_schema';
import { AlertSuppressionMissingFieldsStrategyEnum } from '../../../../../common/api/detection_engine/model/rule_schema';
import type { EqlOptions } from '../../../../../common/search_strategy';
import { assertUnreachable } from '../../../../../common/utility_types';
import * as i18nSeverity from '../severity_mapping/translations';
import * as i18nRiskScore from '../risk_score_mapping/translations';

import * as i18n from './translations';
import type { BuildQueryBarDescription, ListItems } from './types';
import { SeverityBadge } from '../../../../common/components/severity_badge';
import type { AboutStepRiskScore, AboutStepSeverity, Duration } from '../../../common/types';
import { AlertSuppressionDurationType } from '../../../common/types';
import { defaultToEmptyTag } from '../../../../common/components/empty_value';
import { RequiredFieldIcon } from '../../../rule_management/components/rule_details/required_field_icon';
import { THREAT_QUERY_LANGUAGE_LABEL } from '../../../rule_management/components/rule_details/translations';
import { getQueryLanguageLabel } from '../../../rule_management/components/rule_details/helpers';
import { ThreatEuiFlexGroup } from './threat_description';
import { AlertSuppressionLabel } from './alert_suppression_label';
import type { FieldValueThreshold } from '../threshold_input';

const NoteDescriptionContainer = styled(EuiFlexItem)`
  height: 105px;
  overflow-y: hidden;
`;

const SetupDescriptionContainer = styled(EuiFlexItem)`
  height: 105px;
  overflow-y: hidden;
`;

export const isNotEmptyArray = (values: string[]) => !isEmpty(values.join(''));

const EuiBadgeWrap = styled(EuiBadge)`
  .euiBadge__text {
    white-space: pre-wrap !important;
  }
` as unknown as typeof EuiBadge;

const Query = styled.div`
  white-space: pre-wrap;
`;

export const getQueryLabel = (ruleType: Type | undefined): string => {
  switch (ruleType) {
    case 'eql':
      return i18n.EQL_QUERY_LABEL;
    case 'saved_query':
      return i18n.SAVED_QUERY_LABEL;
    case 'esql':
      return i18n.ESQL_QUERY_LABEL;
    default:
      return i18n.QUERY_LABEL;
  }
};

export const buildQueryBarDescription = ({
  field,
  filters,
  filterManager,
  query,
  queryLanguage,
  savedId,
  savedQueryName,
  indexPatterns,
  queryLabel,
}: BuildQueryBarDescription): ListItems[] => {
  const items: ListItems[] = [];
  const isLoadedFromSavedQuery = !isEmpty(savedId) && !isEmpty(savedQueryName);

  if (isLoadedFromSavedQuery) {
    items.push({
      title: <>{i18n.SAVED_QUERY_NAME_LABEL} </>,
      description: <>{savedQueryName} </>,
    });
  }

  if (!isEmpty(filters)) {
    filterManager.setFilters(filters);
    items.push({
      title: <>{isLoadedFromSavedQuery ? i18n.SAVED_QUERY_FILTERS_LABEL : i18n.FILTERS_LABEL} </>,
      description: (
        <EuiFlexGroup wrap responsive={false} gutterSize="xs">
          {filterManager.getFilters().map((filter, index) => (
            <EuiFlexItem grow={false} key={`${field}-filter-${index}`} css={{ width: '100%' }}>
              <EuiBadgeWrap color="hollow">
                {indexPatterns != null ? (
                  <FilterBadgeGroup filters={[filter]} dataViews={[indexPatterns]} />
                ) : (
                  <EuiLoadingSpinner size="m" />
                )}
              </EuiBadgeWrap>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      ),
    });
  }
  if (!isEmpty(query)) {
    items.push({
      title: (
        <>{isLoadedFromSavedQuery ? i18n.SAVED_QUERY_LABEL : queryLabel ?? i18n.QUERY_LABEL}</>
      ),
      description: <Query>{query}</Query>,
    });
  }

  if (queryLanguage) {
    items.push({
      title: THREAT_QUERY_LANGUAGE_LABEL,
      description: getQueryLanguageLabel(queryLanguage),
    });
  }

  return items;
};

export const buildEqlOptionsDescription = (eqlOptions: EqlOptions): ListItems[] => {
  let items: ListItems[] = [];
  if (!isEmpty(eqlOptions.eventCategoryField)) {
    items = [
      ...items,
      {
        title: <>{i18n.EQL_EVENT_CATEGORY_FIELD_LABEL}</>,
        description: <>{eqlOptions.eventCategoryField}</>,
      },
    ];
  }
  if (!isEmpty(eqlOptions.tiebreakerField)) {
    items = [
      ...items,
      {
        title: <>{i18n.EQL_TIEBREAKER_FIELD_LABEL}</>,
        description: <>{eqlOptions.tiebreakerField}</>,
      },
    ];
  }
  if (!isEmpty(eqlOptions.timestampField)) {
    items = [
      ...items,
      {
        title: <>{i18n.EQL_TIMESTAMP_FIELD_LABEL}</>,
        description: <>{eqlOptions.timestampField}</>,
      },
    ];
  }
  return items;
};

interface BuildThreatDescriptionProps {
  label: string;
  threat: Threats;
}

export const buildThreatDescription = ({
  threat,
  label,
}: BuildThreatDescriptionProps): ListItems[] => {
  if (threat.length > 0) {
    return [
      {
        title: label,
        description: <ThreatEuiFlexGroup threat={threat} />,
      },
    ];
  }
  return [];
};

export const buildUnorderedListArrayDescription = (
  label: string,
  field: string,
  values: string[]
): ListItems[] => {
  if (isNotEmptyArray(values)) {
    return [
      {
        title: label,
        description: (
          <EuiText size="s">
            <ul>
              {values.map((val) =>
                isEmpty(val) ? null : (
                  <li data-test-subj="unorderedListArrayDescriptionItem" key={`${field}-${val}`}>
                    {val}
                  </li>
                )
              )}
            </ul>
          </EuiText>
        ),
      },
    ];
  }
  return [];
};

export const buildHighlightedFieldsOverrideDescription = (
  label: string,
  values: string[]
): ListItems[] => {
  if (isEmpty(values)) {
    return [];
  }
  const description = (
    <EuiFlexGroup responsive={false} gutterSize="xs" wrap>
      {values.map((val: string) =>
        isEmpty(val) ? null : (
          <EuiFlexItem grow={false} key={`${label}-${val}`}>
            <EuiBadgeWrap
              data-test-subj="customHighlightedFieldsStringArrayDescriptionBadgeItem"
              color="hollow"
            >
              {val}
            </EuiBadgeWrap>
          </EuiFlexItem>
        )
      )}
    </EuiFlexGroup>
  );

  return [
    {
      title: label,
      description,
    },
  ];
};

export const buildStringArrayDescription = (
  label: string,
  field: string,
  values: string[]
): ListItems[] => {
  if (isNotEmptyArray(values)) {
    return [
      {
        title: label,
        description: (
          <EuiFlexGroup responsive={false} gutterSize="xs" wrap>
            {values.map((val: string) =>
              isEmpty(val) ? null : (
                <EuiFlexItem grow={false} key={`${field}-${val}`}>
                  <EuiBadgeWrap data-test-subj="stringArrayDescriptionBadgeItem" color="hollow">
                    {val}
                  </EuiBadgeWrap>
                </EuiFlexItem>
              )
            )}
          </EuiFlexGroup>
        ),
      },
    ];
  }
  return [];
};

const OverrideColumn = styled(EuiFlexItem)`
  width: 125px;
  max-width: 125px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const OverrideValueColumn = styled(EuiFlexItem)`
  width: 30px;
  max-width: 30px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const buildSeverityDescription = (severity: AboutStepSeverity): ListItems[] => [
  {
    title: i18nSeverity.DEFAULT_SEVERITY,
    description: <SeverityBadge value={severity.value} />,
  },
  ...(severity.isMappingChecked
    ? severity.mapping
        .filter((severityItem) => severityItem.field !== '')
        .map((severityItem, index) => {
          return {
            title: index === 0 ? i18nSeverity.SEVERITY_MAPPING : '',
            description: (
              <EuiFlexGroup alignItems="center" gutterSize="s">
                <OverrideColumn>
                  <EuiToolTip
                    content={severityItem.field}
                    data-test-subj={`severityOverrideField${index}`}
                    disableScreenReaderOutput
                  >
                    <span tabIndex={0}>{`${severityItem.field}:`}</span>
                  </EuiToolTip>
                </OverrideColumn>
                <OverrideValueColumn>
                  <EuiToolTip
                    content={severityItem.value}
                    data-test-subj={`severityOverrideValue${index}`}
                    disableScreenReaderOutput
                  >
                    <span tabIndex={0}>{defaultToEmptyTag(severityItem.value)}</span>
                  </EuiToolTip>
                </OverrideValueColumn>
                <EuiFlexItem grow={false}>
                  <EuiIcon type="sortRight" aria-hidden={true} />
                </EuiFlexItem>
                <EuiFlexItem>
                  <SeverityBadge
                    data-test-subj={`severityOverrideSeverity${index}`}
                    value={severityItem.severity}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            ),
          };
        })
    : []),
];

export const buildRiskScoreDescription = (riskScore: AboutStepRiskScore): ListItems[] => [
  {
    title: i18nRiskScore.RISK_SCORE,
    description: riskScore.value,
  },
  ...(riskScore.isMappingChecked
    ? riskScore.mapping
        .filter((riskScoreItem) => riskScoreItem.field !== '')
        .map((riskScoreItem, index) => {
          return {
            title: index === 0 ? i18nRiskScore.RISK_SCORE_MAPPING : '',
            description: (
              <EuiFlexGroup alignItems="center" gutterSize="s">
                <OverrideColumn>
                  <EuiToolTip
                    content={riskScoreItem.field}
                    data-test-subj={`riskScoreOverrideField${index}`}
                    disableScreenReaderOutput
                  >
                    <span tabIndex={0}>{riskScoreItem.field}</span>
                  </EuiToolTip>
                </OverrideColumn>
                <EuiFlexItem grow={false}>
                  <EuiIcon type={'sortRight'} aria-hidden={true} />
                </EuiFlexItem>
                <EuiFlexItem>{ALERT_RISK_SCORE}</EuiFlexItem>
              </EuiFlexGroup>
            ),
          };
        })
    : []),
];

const MyRefUrlLink = styled(EuiLink)`
  word-break: break-word;
`;

export const buildUrlsDescription = (label: string, values: string[]): ListItems[] => {
  if (isNotEmptyArray(values)) {
    return [
      {
        title: label,
        description: (
          <EuiText size="s">
            <ul>
              {values
                .filter((v) => !isEmpty(v))
                .map((val, index) => (
                  <li data-test-subj="urlsDescriptionReferenceLinkItem" key={`${index}-${val}`}>
                    <MyRefUrlLink href={val} external target="_blank">
                      {val}
                    </MyRefUrlLink>
                  </li>
                ))}
            </ul>
          </EuiText>
        ),
      },
    ];
  }
  return [];
};

export const buildNoteDescription = (label: string, note: string): ListItems[] => {
  if (note.trim() !== '') {
    return [
      {
        title: label,
        description: (
          <NoteDescriptionContainer>
            <div data-test-subj="noteDescriptionItem" className="eui-yScrollWithShadows">
              {note}
            </div>
          </NoteDescriptionContainer>
        ),
      },
    ];
  }
  return [];
};

export const buildRuleTypeDescription = (label: string, ruleType: Type): ListItems[] => {
  switch (ruleType) {
    case 'machine_learning': {
      return [
        {
          title: label,
          description: i18n.ML_TYPE_DESCRIPTION,
        },
      ];
    }
    case 'query':
    case 'saved_query': {
      return [
        {
          title: label,
          description: i18n.QUERY_TYPE_DESCRIPTION,
        },
      ];
    }
    case 'threshold': {
      return [
        {
          title: label,
          description: i18n.THRESHOLD_TYPE_DESCRIPTION,
        },
      ];
    }
    case 'eql': {
      return [
        {
          title: label,
          description: i18n.EQL_TYPE_DESCRIPTION,
        },
      ];
    }
    case 'threat_match': {
      return [
        {
          title: label,
          description: i18n.THREAT_MATCH_TYPE_DESCRIPTION,
        },
      ];
    }
    case 'new_terms': {
      return [
        {
          title: label,
          description: i18n.NEW_TERMS_TYPE_DESCRIPTION,
        },
      ];
    }
    case 'esql': {
      return [
        {
          title: label,
          description: i18n.ESQL_TYPE_DESCRIPTION,
        },
      ];
    }
    default:
      return assertUnreachable(ruleType);
  }
};

export const buildThresholdDescription = (
  label: string,
  threshold: FieldValueThreshold
): ListItems[] => {
  let thresholdDescription = isEmpty(threshold.field[0])
    ? `${i18n.THRESHOLD_RESULTS_ALL} >= ${threshold.value}`
    : `${i18n.THRESHOLD_RESULTS_AGGREGATED_BY} ${threshold.field.join(',')} >= ${threshold.value}`;

  if (threshold.cardinality?.value && threshold.cardinality?.field.length > 0) {
    thresholdDescription = i18n.THRESHOLD_CARDINALITY(
      thresholdDescription,
      threshold.cardinality.field[0],
      threshold.cardinality.value
    );
  }

  return [
    {
      title: label,
      description: <>{thresholdDescription}</>,
    },
  ];
};

export const buildThreatMappingDescription = (
  title: string,
  threatMapping: ThreatMapping
): ListItems[] => {
  const description = constructThreatMappingDescription(threatMapping);

  return [
    {
      title,
      description,
    },
  ];
};

const FieldTypeText = styled(EuiText)`
  font-size: ${({ theme }) => theme.eui.euiFontSizeXS};
  font-family: ${({ theme }) => theme.eui.euiCodeFontFamily};
  display: inline;
`;

export const buildRequiredFieldsDescription = (
  label: string,
  requiredFields: RequiredFieldArray
): ListItems[] => {
  if (isEmpty(requiredFields)) {
    return [];
  }

  return [
    {
      title: label,
      description: (
        <EuiFlexGrid gutterSize={'s'}>
          {requiredFields.map((rF, index) => (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize={'xs'}>
                <EuiFlexItem grow={false}>
                  <RequiredFieldIcon data-test-subj="field-type-icon" type={rF.type} />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <FieldTypeText grow={false} size={'s'}>
                    {` ${rF.name}${index + 1 !== requiredFields.length ? ', ' : ''}`}
                  </FieldTypeText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          ))}
        </EuiFlexGrid>
      ),
    },
  ];
};

export const buildAlertSuppressionDescription = (
  label: string = i18n.ALERT_SUPPRESSION_LABEL,
  values: string[],
  ruleType: Type
): ListItems[] => {
  if (isEmpty(values)) {
    return [];
  }
  const description = (
    <EuiFlexGroup responsive={false} gutterSize="xs" wrap>
      {values.map((val: string) =>
        isEmpty(val) ? null : (
          <EuiFlexItem grow={false} key={`${label}-${val}`}>
            <EuiBadgeWrap data-test-subj="stringArrayDescriptionBadgeItem" color="hollow">
              {val}
            </EuiBadgeWrap>
          </EuiFlexItem>
        )
      )}
    </EuiFlexGroup>
  );

  const title = <AlertSuppressionLabel label={label} ruleType={ruleType} />;
  return [
    {
      title,
      description,
    },
  ];
};

export const buildAlertSuppressionWindowDescription = (
  label: string,
  value: Duration,
  alertSuppressionDuration: AlertSuppressionDurationType,
  ruleType: Type
): ListItems[] => {
  const description =
    alertSuppressionDuration === AlertSuppressionDurationType.PerTimePeriod
      ? `${value.value}${value.unit}`
      : i18n.ALERT_SUPPRESSION_PER_RULE_EXECUTION;

  const title = <AlertSuppressionLabel label={label} ruleType={ruleType} />;
  return [
    {
      title,
      description,
    },
  ];
};

export const buildAlertSuppressionMissingFieldsDescription = (
  label: string,
  value: AlertSuppressionMissingFieldsStrategy,
  ruleType: Type
): ListItems[] => {
  if (isEmpty(value)) {
    return [];
  }

  const description =
    value === AlertSuppressionMissingFieldsStrategyEnum.suppress
      ? i18n.ALERT_SUPPRESSION_SUPPRESS_ON_MISSING_FIELDS
      : i18n.ALERT_SUPPRESSION_DO_NOT_SUPPRESS_ON_MISSING_FIELDS;

  const title = <AlertSuppressionLabel label={label} ruleType={ruleType} />;
  return [
    {
      title,
      description,
    },
  ];
};

export const buildSetupDescription = (label: string, setup: string): ListItems[] => {
  if (setup.trim() !== '') {
    return [
      {
        title: label,
        description: (
          <SetupDescriptionContainer>
            <div data-test-subj="setupDescriptionItem" className="eui-yScrollWithShadows">
              {setup}
            </div>
          </SetupDescriptionContainer>
        ),
      },
    ];
  }
  return [];
};

export const buildIntervalDescription = (label: string, value: string): ListItems[] => {
  return [
    {
      title: label,
      description: <IntervalAbbrScreenReader interval={value} />,
    },
  ];
};
