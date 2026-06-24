/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiText, EuiToolTip, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import React, { useState } from 'react';
import { useRule } from './rule_context';

const KIND_LABELS: Record<string, string> = {
  signal: i18n.translate('xpack.alertingV2.ruleDetails.kindSignal', {
    defaultMessage: 'Signal',
  }),
  alert: i18n.translate('xpack.alertingV2.ruleDetails.kindAlert', {
    defaultMessage: 'Alert',
  }),
};

const KIND_ICONS: Record<string, string> = {
  signal: 'radar',
  alert: 'bell',
};

const KIND_BADGE_TOOLTIP = i18n.translate('xpack.alertingV2.ruleDetails.kindBadgeTooltip', {
  defaultMessage: 'Mode can be changed in the rule edit form',
});

const VISIBLE_TAGS_LIMIT = 5;

/**
 * Renders the description and tags row below the page title.
 */
export const RuleHeaderDescription: React.FC = () => {
  const rule = useRule();
  const { description, tags } = rule.metadata;
  const hasTags = tags && tags.length > 0;
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);

  if (!description && !hasTags) {
    return null;
  }

  const visibleTags = hasTags ? tags!.slice(0, VISIBLE_TAGS_LIMIT) : [];
  const overflowTags = hasTags ? tags!.slice(VISIBLE_TAGS_LIMIT) : [];

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
            {visibleTags!.map((tag) => (
              <EuiFlexItem key={tag} grow={false}>
                <EuiBadge color="hollow">{tag}</EuiBadge>
              </EuiFlexItem>
            ))}
            {overflowTags.length > 0 && (
              <EuiFlexItem grow={false}>
                <EuiPopover
                  button={
                    <EuiBadge
                      color="hollow"
                      iconType="tag"
                      iconSide="left"
                      onClick={() => setIsOverflowOpen((open) => !open)}
                      onClickAriaLabel={i18n.translate(
                        'xpack.alertingV2.ruleDetails.moreTagsAriaLabel',
                        {
                          defaultMessage:
                            'Show {count} more {count, plural, one {tag} other {tags}}',
                          values: { count: overflowTags.length },
                        }
                      )}
                      data-test-subj="ruleTagsOverflowBadge"
                      aria-label="ruleTagsOverflowBadge"
                    >
                      +{overflowTags.length}
                    </EuiBadge>
                  }
                  isOpen={isOverflowOpen}
                  closePopover={() => setIsOverflowOpen(false)}
                  anchorPosition="downCenter"
                  panelPaddingSize="s"
                  aria-label="ruleTagsOverflow"
                >
                  <EuiFlexGroup
                    gutterSize="xs"
                    wrap
                    responsive={false}
                    data-test-subj="ruleTagsOverflowList"
                    css={css`
                      max-inline-size: 320px;
                    `}
                  >
                    {overflowTags.map((tag) => (
                      <EuiFlexItem key={tag} grow={false}>
                        <EuiBadge color="hollow">{tag}</EuiBadge>
                      </EuiFlexItem>
                    ))}
                  </EuiFlexGroup>
                </EuiPopover>
              </EuiFlexItem>
            )}
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
    <EuiToolTip content={KIND_BADGE_TOOLTIP}>
      <EuiBadge
        color="hollow"
        iconType={KIND_ICONS[rule.kind] ?? 'dot'}
        iconSide="left"
        tabIndex={0}
        data-test-subj="kindBadge"
      >
        {KIND_LABELS[rule.kind] ?? rule.kind}
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
