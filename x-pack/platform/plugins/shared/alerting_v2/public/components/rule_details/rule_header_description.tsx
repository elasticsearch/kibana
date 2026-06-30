/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiText, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { RULE_KIND_ICONS, RULE_KIND_LABELS, RULE_KIND_TOOLTIPS } from '@kbn/alerting-v2-constants';
import { useRule } from './rule_context';

/**
 * Renders the description and tags row below the page title.
 */
export const RuleHeaderDescription: React.FC = () => {
  const rule = useRule();
  const { description, tags } = rule.metadata;
  const hasTags = tags && tags.length > 0;

  if (!description && !hasTags) {
    return null;
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      {description && (
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued" data-test-subj="ruleDescription">
            {description}
          </EuiText>
        </EuiFlexItem>
      )}
      {hasTags && (
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" wrap responsive={false} data-test-subj="ruleTags">
            {tags!.map((tag) => (
              <EuiFlexItem key={tag} grow={false}>
                <EuiBadge color="hollow">{tag}</EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};

export interface RuleTitleWithBadgesProps {
  /**
   * `'full'` (default) renders the rule name, kind, and status inline,
   * separated by vertical dividers. `'summary'` stacks the name above a row
   * containing the kind and status badges, designed for the rule summary flyout.
   */
  variant?: 'full' | 'summary';
}

/**
 * Rule name with kind and status. Defaults to the inline `'full'` layout;
 * pass `variant="summary"` to render the name above the badges row.
 */
export const RuleTitleWithBadges: React.FC<RuleTitleWithBadgesProps> = ({ variant = 'full' }) => {
  const rule = useRule();
  const isSummary = variant === 'summary';

  const kindBadge = (
    <EuiToolTip content={RULE_KIND_TOOLTIPS[rule.kind]}>
      <EuiBadge
        color="hollow"
        iconType={RULE_KIND_ICONS[rule.kind] ?? 'dot'}
        iconSide="left"
        tabIndex={0}
        data-test-subj="kindBadge"
      >
        {RULE_KIND_LABELS[rule.kind] ?? rule.kind}
      </EuiBadge>
    </EuiToolTip>
  );

  const statusBadge = rule.enabled ? (
    <EuiBadge color="success" data-test-subj="enabledBadge">
      {i18n.translate('xpack.alertingV2.ruleDetails.enabled', {
        defaultMessage: 'Enabled',
      })}
    </EuiBadge>
  ) : (
    <EuiBadge color="default" data-test-subj="disabledBadge">
      {i18n.translate('xpack.alertingV2.ruleDetails.disabled', {
        defaultMessage: 'Disabled',
      })}
    </EuiBadge>
  );

  const divider = (
    <EuiText size="s" color="text" aria-hidden={true}>
      |
    </EuiText>
  );

  if (isSummary) {
    return (
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem grow={false}>
          <span data-test-subj="ruleName">{rule.metadata.name}</span>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="m" wrap={false} responsive={false}>
            <EuiFlexItem grow={false}>{kindBadge}</EuiFlexItem>
            <EuiFlexItem grow={false}>{divider}</EuiFlexItem>
            <EuiFlexItem grow={false}>{statusBadge}</EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  return (
    <EuiFlexGroup alignItems="center" gutterSize="m" wrap={false} responsive={false}>
      <EuiFlexItem grow={false}>
        <span data-test-subj="ruleName">{rule.metadata.name}</span>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>{divider}</EuiFlexItem>
      <EuiFlexItem grow={false}>{kindBadge}</EuiFlexItem>
      <EuiFlexItem grow={false}>{divider}</EuiFlexItem>
      <EuiFlexItem grow={false}>{statusBadge}</EuiFlexItem>
    </EuiFlexGroup>
  );
};
