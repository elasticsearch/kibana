/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { RULE_KIND_ICONS, RULE_KIND_LABELS, RULE_KIND_TOOLTIPS } from '@kbn/alerting-v2-constants';
import { getBreachEsqlQuery, type RuleResponse } from '@kbn/alerting-v2-schemas';
import * as i18n from './translations';

export interface AlertEpisodeRuleOverviewPanelProps {
  rule: RuleResponse;
  ruleDetailsHref: string;
}

export const AlertEpisodeRuleOverviewPanel = ({
  rule,
  ruleDetailsHref,
}: AlertEpisodeRuleOverviewPanelProps) => {
  const ruleKindLabel = RULE_KIND_LABELS[rule.kind] ?? rule.kind;

  const titleNode = (
    <EuiTitle size="xs">
      <h3 data-test-subj="alertingV2EpisodeDetailsRuleOverviewHeading">
        {i18n.RULE_OVERVIEW_TITLE}
      </h3>
    </EuiTitle>
  );

  const viewDetailsButton = (
    <EuiButtonEmpty
      size="xs"
      color="text"
      iconType="eye"
      href={ruleDetailsHref}
      data-test-subj="alertingV2EpisodeDetailsViewRuleDetailsButton"
    >
      {i18n.RULE_OVERVIEW_VIEW_DETAILS}
    </EuiButtonEmpty>
  );

  const bodyInner = (
    <>
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>{rule.metadata.name}</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            |
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content={RULE_KIND_TOOLTIPS[rule.kind] ?? ''}>
            <EuiBadge
              color="hollow"
              iconType={RULE_KIND_ICONS[rule.kind] ?? 'dot'}
              iconSide="left"
              tabIndex={0}
              data-test-subj="alertingV2EpisodeDetailsRuleKindBadge"
            >
              {ruleKindLabel}
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            |
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge
            color={rule.enabled ? 'success' : 'default'}
            data-test-subj="alertingV2EpisodeDetailsRuleStatusBadge"
          >
            {rule.enabled ? i18n.RULE_OVERVIEW_ENABLED : i18n.RULE_OVERVIEW_DISABLED}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiCodeBlock
        language="esql"
        fontSize="s"
        paddingSize="s"
        isCopyable
        overflowHeight={240}
        data-test-subj="alertingV2EpisodeDetailsRuleQueryCodeBlock"
      >
        {getBreachEsqlQuery(rule.query)}
      </EuiCodeBlock>
    </>
  );

  return (
    <div>
      <EuiFlexGroup
        alignItems="center"
        justifyContent="spaceBetween"
        responsive={false}
        gutterSize="s"
      >
        <EuiFlexItem grow={false}>{titleNode}</EuiFlexItem>
        <EuiFlexItem grow={false}>{viewDetailsButton}</EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiPanel
        hasBorder
        paddingSize="m"
        data-test-subj="alertingV2EpisodeDetailsRuleOverviewPanel"
      >
        {bodyInner}
      </EuiPanel>
    </div>
  );
};
