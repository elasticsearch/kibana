/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiBadge, EuiToolTip } from '@elastic/eui';
import React from 'react';
import { i18n } from '@kbn/i18n';
import type { WorkflowTokenUsage } from '@kbn/workflows';

interface TokenUsageBadgeProps {
  usage?: WorkflowTokenUsage;
  /**
   * When true, render only the compact total (e.g. `25K`) without the
   * " tokens" suffix. Use in tight layouts like the step execution tree where
   * the full label would crowd out the step name; the full breakdown is still
   * available in the tooltip.
   */
  compact?: boolean;
  'data-test-subj'?: string;
}

const compactNumberFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullNumberFormatter = new Intl.NumberFormat();

/**
 * Compact badge showing total LLM token usage, with a tooltip breaking the
 * total down into input / output tokens. Renders `null` when no usage is
 * reported, so callers can drop it in unconditionally.
 */
export const TokenUsageBadge = React.memo<TokenUsageBadgeProps>(
  ({ usage, compact = false, 'data-test-subj': dataTestSubj = 'workflowTokenUsageBadge' }) => {
    if (!usage) {
      return null;
    }

    const tooltipContent = i18n.translate('workflowsManagement.tokenUsage.breakdownTooltip', {
      defaultMessage: 'Input: {input} · Output: {output}',
      values: {
        input: fullNumberFormatter.format(usage.inputTokens),
        output: fullNumberFormatter.format(usage.outputTokens),
      },
    });

    const total = compactNumberFormatter.format(usage.totalTokens);
    const label = compact
      ? total
      : i18n.translate('workflowsManagement.tokenUsage.totalBadge', {
          defaultMessage: '{total} tokens',
          values: { total },
        });

    return (
      <EuiToolTip content={tooltipContent}>
        <EuiBadge
          color="hollow"
          iconType="sparkles"
          title=""
          tabIndex={0}
          data-test-subj={dataTestSubj}
        >
          {label}
        </EuiBadge>
      </EuiToolTip>
    );
  }
);

TokenUsageBadge.displayName = 'TokenUsageBadge';
