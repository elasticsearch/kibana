/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCodeBlock,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLink,
  EuiLoadingSpinner,
  EuiPageHeader,
  EuiPanel,
  EuiSpacer,
  EuiTabbedContent,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { EuiTabbedContentTab } from '@elastic/eui';
import { useQuery } from '@kbn/react-query';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { getBreachEsqlQuery } from '@kbn/alerting-v2-schemas';
import { useHistory, useParams } from 'react-router-dom';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import { useKibana } from '../../common/lib/kibana';
import { SecuritySolutionPageWrapper } from '../../common/components/page_wrapper';
import { ExecutionLogTable } from '../components/execution_log_table';
import { RuleAlertsTable } from '../components/rule_alerts_table';
import { ExceptionsViewer } from '../../detection_engine/rule_exceptions/components/all_exception_items_table';
import { parseThresholdEsqlQuery } from '../utils/threshold_to_esql';
import { toV1ExceptionRuleShape } from '../utils/v2_rule_to_v1_shape';
import * as i18n from '../translations';

const RULE_EXCEPTION_LIST_TYPES = [
  ExceptionListTypeEnum.DETECTION,
  ExceptionListTypeEnum.RULE_DEFAULT,
];

const OverviewTab: React.FC<{ rule: RuleResponse }> = ({ rule }) => {
  const descriptionItems = [
    ...(rule.metadata.description
      ? [{ title: i18n.VIEW_DESCRIPTION_LABEL, description: rule.metadata.description }]
      : []),
    {
      title: 'Kind',
      description: (
        <EuiBadge color={rule.kind === 'alert' ? 'primary' : 'hollow'}>{rule.kind}</EuiBadge>
      ),
    },
    {
      title: 'Status',
      description: rule.enabled ? (
        <EuiHealth color="success">Enabled</EuiHealth>
      ) : (
        <EuiHealth color="subdued">Disabled</EuiHealth>
      ),
    },
    {
      title: i18n.VIEW_TIME_FIELD_LABEL,
      description: rule.time_field,
    },
    {
      title: i18n.VIEW_SCHEDULE_LABEL,
      description: `Every ${rule.schedule.every}${
        rule.schedule.lookback ? `, lookback ${rule.schedule.lookback}` : ''
      }`,
    },
    ...(rule.grouping?.fields?.length
      ? [
          {
            title: i18n.VIEW_GROUPING_LABEL,
            description: (
              <EuiFlexGroup gutterSize="xs" wrap>
                {rule.grouping.fields.map((field) => (
                  <EuiFlexItem grow={false} key={field}>
                    <EuiBadge color="hollow">{field}</EuiBadge>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ),
          },
        ]
      : []),
    ...(rule.grouping?.duration
      ? [
          {
            title: i18n.VIEW_SUPPRESSION_DURATION_LABEL,
            description: rule.grouping.duration,
          },
        ]
      : []),
    ...(rule.metadata.tags?.length
      ? [
          {
            title: 'Tags',
            description: (
              <EuiFlexGroup gutterSize="xs" wrap>
                {rule.metadata.tags.map((tag) => (
                  <EuiFlexItem grow={false} key={tag}>
                    <EuiBadge color="hollow">{tag}</EuiBadge>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ),
          },
        ]
      : []),
  ];

  const isThreshold = rule.metadata.tags?.includes('threshold') ?? false;
  const breachQuery = getBreachEsqlQuery(rule.query);
  const parsedThreshold = useMemo(
    () => (isThreshold ? parseThresholdEsqlQuery(breachQuery) : null),
    [isThreshold, breachQuery]
  );

  const thresholdItems = parsedThreshold
    ? [
        {
          title: i18n.INDEX_PATTERNS_LABEL,
          description: (
            <EuiFlexGroup gutterSize="xs" wrap>
              {parsedThreshold.indexPatterns.map((p) => (
                <EuiFlexItem grow={false} key={p}>
                  <EuiBadge color="hollow">{p}</EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          ),
        },
        {
          title: i18n.THRESHOLD_VALUE_LABEL,
          description: `>= ${parsedThreshold.thresholdValue}`,
        },
        ...(parsedThreshold.thresholdFields.length > 0
          ? [
              {
                title: i18n.THRESHOLD_GROUP_BY_LABEL,
                description: (
                  <EuiFlexGroup gutterSize="xs" wrap>
                    {parsedThreshold.thresholdFields.map((f) => (
                      <EuiFlexItem grow={false} key={f}>
                        <EuiBadge color="hollow">{f}</EuiBadge>
                      </EuiFlexItem>
                    ))}
                  </EuiFlexGroup>
                ),
              },
            ]
          : []),
        ...(parsedThreshold.cardinalityField
          ? [
              {
                title: i18n.CARDINALITY_FIELD_LABEL,
                description: parsedThreshold.cardinalityField,
              },
              {
                title: i18n.CARDINALITY_VALUE_LABEL,
                description: `>= ${parsedThreshold.cardinalityValue ?? 0}`,
              },
            ]
          : []),
      ]
    : [];

  const { params } = rule;
  const paramsItems = [
    ...(params?.note
      ? [
          {
            title: i18n.NOTE_LABEL,
            description: (
              <EuiText size="s">
                <p>{params.note}</p>
              </EuiText>
            ),
          },
        ]
      : []),
    ...(params?.setup
      ? [
          {
            title: i18n.SETUP_LABEL,
            description: (
              <EuiText size="s">
                <p>{params.setup}</p>
              </EuiText>
            ),
          },
        ]
      : []),
    ...(params?.references?.length
      ? [
          {
            title: i18n.REFERENCES_LABEL,
            description: (
              <EuiFlexGroup direction="column" gutterSize="xs">
                {params.references.map((ref, idx) => (
                  <EuiFlexItem key={idx} grow={false}>
                    <EuiLink href={ref} target="_blank" external>
                      {ref}
                    </EuiLink>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ),
          },
        ]
      : []),
    ...(params?.investigation_fields?.field_names?.length
      ? [
          {
            title: i18n.INVESTIGATION_FIELDS_LABEL,
            description: (
              <EuiFlexGroup gutterSize="xs" wrap>
                {params.investigation_fields.field_names.map((f) => (
                  <EuiFlexItem grow={false} key={f}>
                    <EuiBadge color="hollow">{f}</EuiBadge>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ),
          },
        ]
      : []),
    ...(params?.related_integrations?.length
      ? [
          {
            title: i18n.RELATED_INTEGRATIONS_LABEL,
            description: (
              <EuiFlexGroup gutterSize="xs" wrap>
                {params.related_integrations.map((ri, idx) => (
                  <EuiFlexItem grow={false} key={idx}>
                    <EuiBadge color="hollow">
                      {ri.package}:{ri.version}
                      {ri.integration ? ` (${ri.integration})` : ''}
                    </EuiBadge>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ),
          },
        ]
      : []),
    ...(params?.threat?.length
      ? [
          {
            title: i18n.THREAT_LABEL,
            description: (
              <EuiFlexGroup direction="column" gutterSize="xs">
                {params.threat.map((t, idx) => (
                  <EuiFlexItem key={idx} grow={false}>
                    <EuiBadge color="warning">
                      {t.tactic.name}
                      {t.technique?.length
                        ? ` > ${t.technique.map((tech) => tech.name).join(', ')}`
                        : ''}
                    </EuiBadge>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <EuiSpacer size="l" />
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiPanel paddingSize="l">
            <EuiTitle size="xs">
              <h3>{i18n.VIEW_RULE}</h3>
            </EuiTitle>
            <EuiSpacer size="m" />
            <EuiDescriptionList listItems={descriptionItems} type="column" />
          </EuiPanel>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiPanel paddingSize="l">
            <EuiTitle size="xs">
              <h3>{i18n.VIEW_QUERY_LABEL}</h3>
            </EuiTitle>
            <EuiSpacer size="m" />
            <EuiCodeBlock language="esql" fontSize="m" paddingSize="m" isCopyable>
              {breachQuery}
            </EuiCodeBlock>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      {thresholdItems.length > 0 && (
        <>
          <EuiSpacer size="l" />
          <EuiPanel paddingSize="l">
            <EuiTitle size="xs">
              <h3>{i18n.THRESHOLD_LABEL}</h3>
            </EuiTitle>
            <EuiSpacer size="m" />
            <EuiDescriptionList listItems={thresholdItems} type="column" />
          </EuiPanel>
        </>
      )}

      {paramsItems.length > 0 && (
        <>
          <EuiSpacer size="l" />
          <EuiPanel paddingSize="l">
            <EuiTitle size="xs">
              <h3>{i18n.DETECTION_FIELDS_ACCORDION}</h3>
            </EuiTitle>
            <EuiSpacer size="m" />
            <EuiDescriptionList listItems={paramsItems} type="column" />
          </EuiPanel>
        </>
      )}
    </>
  );
};

const AlertsTab: React.FC<{ ruleId: string }> = ({ ruleId }) => (
  <>
    <EuiSpacer size="l" />
    <RuleAlertsTable ruleId={ruleId} />
  </>
);

export const RulesV2ViewPage = () => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const { http } = useKibana().services;

  const {
    data: rule,
    isLoading,
    isError,
    error,
    refetch: refreshRule,
  } = useQuery(['rulesV2View', id], () =>
    http.get<RuleResponse>(`${ALERTING_V2_RULE_API_PATH}/${id}`)
  );

  const v1RuleShape = useMemo(() => (rule ? toV1ExceptionRuleShape(rule) : null), [rule]);

  const handleRuleChange = useMemo(() => () => refreshRule(), [refreshRule]);

  const tabs = useMemo<EuiTabbedContentTab[]>(
    () => [
      {
        id: 'overview',
        name: i18n.TAB_OVERVIEW,
        content: rule ? <OverviewTab rule={rule} /> : null,
      },
      {
        id: 'alerts',
        name: i18n.TAB_ALERTS,
        content: <AlertsTab ruleId={id} />,
      },
      {
        id: 'rule_exceptions',
        name: 'Rule exceptions',
        content: (
          <>
            <EuiSpacer size="l" />
            <ExceptionsViewer
              rule={v1RuleShape}
              listTypes={RULE_EXCEPTION_LIST_TYPES}
              onRuleChange={handleRuleChange}
              isViewReadOnly={false}
              data-test-subj="v2ExceptionTab"
            />
          </>
        ),
      },
      {
        id: 'execution-log',
        name: 'Execution results',
        content: (
          <>
            <EuiSpacer size="m" />
            <EuiPanel paddingSize="l" hasBorder>
              <ExecutionLogTable ruleId={id} />
            </EuiPanel>
          </>
        ),
      },
    ],
    [rule, id, v1RuleShape, handleRuleChange]
  );

  if (isLoading) {
    return (
      <SecuritySolutionPageWrapper>
        <EuiFlexGroup justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </SecuritySolutionPageWrapper>
    );
  }

  if (isError || !rule) {
    return (
      <SecuritySolutionPageWrapper>
        <EuiCallOut title={i18n.RULE_LOAD_ERROR} color="danger" iconType="error">
          {error instanceof Error ? error.message : String(error)}
        </EuiCallOut>
      </SecuritySolutionPageWrapper>
    );
  }

  return (
    <SecuritySolutionPageWrapper>
      <EuiButtonEmpty
        iconType="arrowLeft"
        onClick={() => history.push('/rules')}
        flush="left"
        size="s"
      >
        {i18n.BACK_TO_RULES}
      </EuiButtonEmpty>

      <EuiSpacer size="m" />

      <EuiPageHeader
        pageTitle={rule.metadata.name}
        rightSideItems={[
          <EuiButton
            key="edit-rule"
            fill
            onClick={() => history.push(`/rules_v2/edit/${id}`)}
            data-test-subj="rulesV2EditRuleButton"
          >
            {i18n.EDIT_RULE}
          </EuiButton>,
        ]}
      />

      <EuiSpacer size="l" />

      <EuiTabbedContent tabs={tabs} initialSelectedTab={tabs[0]} autoFocus="selected" />
    </SecuritySolutionPageWrapper>
  );
};
