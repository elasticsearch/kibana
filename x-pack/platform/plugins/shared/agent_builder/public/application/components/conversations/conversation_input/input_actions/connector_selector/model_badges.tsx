/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiIcon, EuiToolTip } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { EisInferenceEndpointMetadata } from '@kbn/inference-common';
import React, { useState } from 'react';

const RETIREMENT_WARNING_DAYS = 60;

const extendedReasoningLabel = i18n.translate(
  'xpack.agentBuilder.conversationInput.connectorSelector.modelBadge.extendedReasoning',
  { defaultMessage: 'Extended reasoning' }
);

const highThroughputLabel = i18n.translate(
  'xpack.agentBuilder.conversationInput.connectorSelector.modelBadge.highThroughput',
  { defaultMessage: 'High throughput' }
);

const openWeightsLabel = i18n.translate(
  'xpack.agentBuilder.conversationInput.connectorSelector.modelBadge.openWeights',
  { defaultMessage: 'Open weights' }
);

const extendedReasoningTooltip = i18n.translate(
  'xpack.agentBuilder.conversationInput.connectorSelector.modelBadge.extendedReasoning.tooltip',
  { defaultMessage: 'Best for complex analysis, ES|QL-heavy dashboards. Higher latency and cost.' }
);

const highThroughputTooltip = i18n.translate(
  'xpack.agentBuilder.conversationInput.connectorSelector.modelBadge.highThroughput.tooltip',
  { defaultMessage: 'Latency-sensitive tasks, high-concurrency. Lower reasoning depth.' }
);

const openWeightsTooltip = i18n.translate(
  'xpack.agentBuilder.conversationInput.connectorSelector.modelBadge.openWeights.tooltip',
  { defaultMessage: 'Model weights are publicly available and can be self-hosted.' }
);

const modelCapabilitiesAriaLabel = i18n.translate(
  'xpack.agentBuilder.conversationInput.connectorSelector.modelBadge.capabilitiesAriaLabel',
  { defaultMessage: 'View model capabilities' }
);

const retirementWarningTooltip = (endOfLifeDate: string): string => {
  const formatted = new Date(endOfLifeDate).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  return i18n.translate(
    'xpack.agentBuilder.conversationInput.connectorSelector.modelBadge.retirement.tooltip',
    {
      defaultMessage: 'Retiring {date} — select a different model to avoid disruption.',
      values: { date: formatted },
    }
  );
};

interface ModelBadgesProps {
  metadata?: EisInferenceEndpointMetadata;
}

/** Warning icon with tooltip for models retiring within 60 days. */
export const ModelRetirementIcon: React.FC<ModelBadgesProps> = ({ metadata }) => {
  const endOfLifeDate = metadata?.heuristics?.end_of_life_date;
  if (!endOfLifeDate) return null;
  const msUntilEol = Date.parse(endOfLifeDate) - Date.now();
  if (msUntilEol > RETIREMENT_WARNING_DAYS * 24 * 60 * 60 * 1000) return null;
  return (
    <EuiToolTip content={retirementWarningTooltip(endOfLifeDate)}>
      <EuiIcon
        type="warning"
        size="s"
        color="warning"
        tabIndex={0}
        aria-label={retirementWarningTooltip(endOfLifeDate)}
        data-test-subj="modelBadgeRetirement"
      />
    </EuiToolTip>
  );
};

/** Capability badges */
const ModelCapabilityBadges: React.FC<ModelBadgesProps> = ({ metadata }) => {
  const properties: string[] = metadata?.heuristics?.properties ?? [];

  const showExtendedReasoning = properties.includes('capable');
  const showHighThroughput = properties.includes('efficient');
  const showOpenWeights = properties.includes('open-weights');

  if (!showExtendedReasoning && !showHighThroughput && !showOpenWeights) return null;

  return (
    <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center" wrap={false}>
      {showExtendedReasoning && (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={extendedReasoningTooltip}>
            <EuiBadge color="primary" tabIndex={0} data-test-subj="modelBadgeExtendedReasoning">
              {extendedReasoningLabel}
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
      )}
      {showHighThroughput && (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={highThroughputTooltip}>
            <EuiBadge color="hollow" tabIndex={0} data-test-subj="modelBadgeHighThroughput">
              {highThroughputLabel}
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
      )}
      {showOpenWeights && (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={openWeightsTooltip}>
            <EuiBadge color="hollow" tabIndex={0} data-test-subj="modelBadgeOpenWeights">
              {openWeightsLabel}
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};

/**
 * Shows a ⓘ icon that expands into capability badges on hover.
 * Renders nothing for models with no capability properties.
 */
export const ModelBadgesReveal: React.FC<ModelBadgesProps> = ({ metadata }) => {
  const [isHovered, setIsHovered] = useState(false);

  const properties: string[] = metadata?.heuristics?.properties ?? [];
  const hasCapabilities = properties.some((p) =>
    ['capable', 'efficient', 'open-weights'].includes(p)
  );

  if (!hasCapabilities) return null;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      css={css`
        display: flex;
        align-items: center;
      `}
    >
      {isHovered ? (
        <ModelCapabilityBadges metadata={metadata} />
      ) : (
        <EuiIcon
          type="info"
          size="s"
          color="subdued"
          aria-label={modelCapabilitiesAriaLabel}
          data-test-subj="modelBadgesRevealIcon"
        />
      )}
    </div>
  );
};
