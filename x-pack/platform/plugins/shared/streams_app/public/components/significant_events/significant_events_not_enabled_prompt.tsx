/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiEmptyPrompt, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { SignificantEventsUnavailableReason } from '@kbn/streams-plugin/common';
import React from 'react';

// The server reasons plus the client-only `unknown` fallback, surfaced when the
// availability request itself fails (see `useSignificantEventsAvailability`).
type NotEnabledReason = SignificantEventsUnavailableReason | 'unknown';

export function SignificantEventsNotEnabledPrompt({ reason }: { reason: NotEnabledReason }) {
  return (
    <EuiEmptyPrompt
      data-test-subj="streamsSignificantEventsNotEnabledPrompt"
      iconType="bell"
      color="subdued"
      title={
        <h2>
          {i18n.translate('xpack.streams.significantEvents.notEnabledPrompt.title', {
            defaultMessage: 'Significant events is not enabled',
          })}
        </h2>
      }
      body={
        <EuiText>
          <p>{NOT_ENABLED_BODY_MESSAGES[reason]()}</p>
        </EuiText>
      }
    />
  );
}

/**
 * The body message shown for each reason significant events can be unavailable.
 * Keying by reason makes this exhaustive: TypeScript errors if any
 * `SignificantEventsUnavailableReason` lacks a message here. Factories are lazy
 * so `i18n.translate` runs at render time.
 */
const NOT_ENABLED_BODY_MESSAGES: Record<NotEnabledReason, () => string> = {
  pricing_tier: () =>
    i18n.translate('xpack.streams.significantEvents.notEnabledPrompt.pricingTierBody', {
      defaultMessage: 'Significant events is not available on the current pricing tier.',
    }),
  license: () =>
    i18n.translate('xpack.streams.significantEvents.notEnabledPrompt.licenseBody', {
      defaultMessage: 'An Enterprise license or higher is required to use significant events.',
    }),
  ui_setting: () =>
    i18n.translate('xpack.streams.significantEvents.notEnabledPrompt.uiSettingBody', {
      defaultMessage:
        'Significant events is disabled. Enable it in Advanced Settings to start using it.',
    }),
  unknown: () =>
    i18n.translate('xpack.streams.significantEvents.notEnabledPrompt.unknownBody', {
      defaultMessage:
        'We could not determine whether significant events is available. Please check your connection and try again.',
    }),
  workflowsExtensions: () =>
    i18n.translate('xpack.streams.significantEvents.notEnabledPrompt.workflowsBody', {
      defaultMessage:
        'Significant events relies on Workflows, which is not available in this environment.',
    }),
  workflowsManagement: () =>
    i18n.translate('xpack.streams.significantEvents.notEnabledPrompt.workflowsBody', {
      defaultMessage:
        'Significant events relies on Workflows, which is not available in this environment.',
    }),
  searchInferenceEndpoints: () =>
    i18n.translate('xpack.streams.significantEvents.notEnabledPrompt.inferenceBody', {
      defaultMessage:
        'Significant events requires inference connectors, which are not available in this environment.',
    }),
  agentBuilder: () =>
    i18n.translate('xpack.streams.significantEvents.notEnabledPrompt.agentBuilderBody', {
      defaultMessage:
        'Significant events relies on Agent Builder, which is not available in this environment.',
    }),
};
