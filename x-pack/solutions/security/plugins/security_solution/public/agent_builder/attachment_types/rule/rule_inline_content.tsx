/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import useObservable from 'react-use/lib/useObservable';
import { i18n } from '@kbn/i18n';
import {
  EuiBadge,
  EuiCallOut,
  EuiCodeBlock,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { type AttachmentRenderProps } from '@kbn/agent-builder-browser/attachments';
import type { RuleResponse } from '../../../../common/api/detection_engine/model/rule_schema';
import { ThreatEuiFlexGroup } from '../../../detection_engine/rule_creation_ui/components/description_step/threat_description';
import type { AiRuleCreationService } from '../../../detection_engine/common/ai_rule_creation_store';
import { toSimpleRuleSchedule } from '../../../../common/api/detection_engine/model/rule_schema/to_simple_rule_schedule';
import { FiltersDisplay } from './filters_display';
import { RuleTypeDetails } from './rule_type_details';
import { parseRuleFromAttachment, getRuleTypeLabel, getQueryLabel } from './helpers';
import type { RuleAttachment } from './helpers';
import { INDEX_FIELD_LABEL, RULE_TYPE_FIELD_LABEL } from './translations';

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <EuiText size="s">
    <strong>{children}</strong>
  </EuiText>
);

const TagsBadgeList: React.FC<{ tags: string[] }> = ({ tags }) => (
  <EuiFlexGroup responsive={false} gutterSize="xs" wrap>
    {tags.map((tag) => (
      <EuiFlexItem grow={false} key={tag}>
        <EuiBadge color="hollow">{tag}</EuiBadge>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

const IndexPatterns: React.FC<{ patterns: string[] }> = ({ patterns }) => (
  <>
    <SectionHeading>{INDEX_FIELD_LABEL}</SectionHeading>
    <EuiSpacer size="xs" />
    <EuiFlexGroup responsive={false} gutterSize="xs" wrap>
      {patterns.map((pattern) => (
        <EuiFlexItem grow={false} key={pattern}>
          <EuiBadge color="hollow">{pattern}</EuiBadge>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  </>
);

const SeverityRiskScore: React.FC<{
  severity?: string;
  riskScore?: number;
}> = ({ severity, riskScore }) => (
  <EuiText size="s">
    {severity && (
      <>
        <strong>
          {i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.severityLabel', {
            defaultMessage: 'Severity:',
          })}
        </strong>{' '}
        {severity.charAt(0).toUpperCase() + severity.slice(1)}
        {riskScore !== undefined && <>{' | '}</>}
      </>
    )}
    {riskScore !== undefined && (
      <>
        <strong>
          {i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.riskScoreLabel', {
            defaultMessage: 'Risk Score:',
          })}
        </strong>{' '}
        {riskScore}
      </>
    )}
  </EuiText>
);

const getRuleDisplayFields = (rule: RuleResponse) => ({
  query: 'query' in rule ? rule.query : undefined,
  index: 'index' in rule ? (rule.index as string[] | undefined) : undefined,
  filters: 'filters' in rule ? (rule.filters as unknown[] | undefined) : undefined,
  interval: 'interval' in rule ? rule.interval : undefined,
  from: 'from' in rule ? rule.from : undefined,
});

interface RuleInlineContentProps extends AttachmentRenderProps<RuleAttachment> {
  aiRuleCreation: AiRuleCreationService;
}

export const RuleInlineContent: React.FC<RuleInlineContentProps> = ({
  attachment,
  aiRuleCreation,
}) => {
  const savingAttachmentId = useObservable(aiRuleCreation.saving$, null);
  const isSaving = savingAttachmentId === attachment.id;

  const rule = useMemo(() => parseRuleFromAttachment(attachment), [attachment]);

  if (!rule) {
    return null;
  }

  const { query, index, filters, interval, from } = getRuleDisplayFields(rule);
  const schedule = interval
    ? toSimpleRuleSchedule({ interval, from: from ?? `now-${interval}`, to: 'now' })
    : undefined;

  return (
    <EuiPanel paddingSize="m" hasShadow={false} hasBorder={false}>
      {isSaving && (
        <>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="s" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.savingText', {
                  defaultMessage: 'Saving…',
                })}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
        </>
      )}
      {rule.type && (
        <EuiText size="s">
          <strong>
            {RULE_TYPE_FIELD_LABEL}
            {':'}
          </strong>{' '}
          {getRuleTypeLabel(rule.type)}
        </EuiText>
      )}

      {rule.description && (
        <>
          <EuiSpacer size="s" />
          <SectionHeading>
            {i18n.translate(
              'xpack.securitySolution.agentBuilder.ruleAttachment.descriptionHeading',
              { defaultMessage: 'Description' }
            )}
          </SectionHeading>
          <EuiSpacer size="xs" />
          <EuiText size="s">{rule.description}</EuiText>
        </>
      )}

      {query && (
        <>
          <EuiSpacer size="s" />
          <SectionHeading>{getQueryLabel(rule)}</SectionHeading>
          <EuiSpacer size="xs" />
          <EuiCodeBlock
            language="esql"
            fontSize="s"
            paddingSize="s"
            overflowHeight={150}
            isCopyable
          >
            {query}
          </EuiCodeBlock>
        </>
      )}

      {index && index.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <IndexPatterns patterns={index} />
        </>
      )}

      {filters && filters.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <FiltersDisplay filters={filters} />
        </>
      )}

      {[
        'threshold',
        'threat_match',
        'machine_learning',
        'new_terms',
        'saved_query',
        'eql',
      ].includes(rule.type) && (
        <>
          <EuiSpacer size="s" />
          <RuleTypeDetails rule={rule} />
        </>
      )}

      {rule.tags && rule.tags.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <SectionHeading>
            {i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.tagsHeading', {
              defaultMessage: 'Tags',
            })}
          </SectionHeading>
          <EuiSpacer size="xs" />
          <TagsBadgeList tags={rule.tags} />
        </>
      )}

      {rule.threat && rule.threat.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <SectionHeading>
            {i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.mitreHeading', {
              defaultMessage: 'MITRE ATT&CK',
            })}
          </SectionHeading>
          <EuiSpacer size="xs" />
          <EuiFlexGrid columns={2} gutterSize="m" responsive={false}>
            {rule.threat.map((entry, threatIndex) => (
              <EuiFlexItem key={threatIndex}>
                <ThreatEuiFlexGroup threat={[entry]} />
              </EuiFlexItem>
            ))}
          </EuiFlexGrid>
        </>
      )}

      <EuiSpacer size="s" />
      <SeverityRiskScore severity={rule.severity} riskScore={rule.risk_score} />

      {interval && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="s">
            <strong>
              {i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.intervalLabel', {
                defaultMessage: 'Interval:',
              })}
            </strong>{' '}
            {schedule?.interval ?? interval}
            {schedule?.lookback && (
              <>
                {' | '}
                <strong>
                  {i18n.translate(
                    'xpack.securitySolution.agentBuilder.ruleAttachment.lookbackLabel',
                    { defaultMessage: 'Lookback time:' }
                  )}
                </strong>{' '}
                {schedule.lookback}
              </>
            )}
          </EuiText>
        </>
      )}

      <EuiSpacer size="s" />
      <EuiCallOut
        size="s"
        color="primary"
        iconType="info"
        title={i18n.translate(
          'xpack.securitySolution.agentBuilder.ruleAttachment.limitationsTitle',
          { defaultMessage: 'AI rule creation limitations' }
        )}
      >
        <EuiText size="xs">
          {i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.limitationsBody', {
            defaultMessage:
              'Only ES|QL rules are supported. Requires existing index data. Severity and risk score default to Low / 21 — ask the assistant to change them.',
          })}
        </EuiText>
      </EuiCallOut>
    </EuiPanel>
  );
};
