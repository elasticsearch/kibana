/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButton, EuiSpacer, EuiSplitPanel, EuiText, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useCleanupStaleEvents } from '../../../../hooks/use_cleanup_stale_events';

export function StaleEventCleanupSection({ canManage }: { canManage: boolean }) {
  const { cleanupStaleEvents, isCleaningUp } = useCleanupStaleEvents();

  return (
    <EuiSplitPanel.Outer hasBorder hasShadow={false} css={{ flexShrink: 0 }}>
      <EuiSplitPanel.Inner color="subdued">
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('xpack.significantEventsApp.settings.staleEventCleanup.title', {
              defaultMessage: 'Stale event cleanup',
            })}
          </h3>
        </EuiTitle>
      </EuiSplitPanel.Inner>
      <EuiSplitPanel.Inner>
        <EuiText size="s">
          <p>
            {i18n.translate('xpack.significantEventsApp.settings.staleEventCleanup.description', {
              defaultMessage:
                'Close open significant events when none of their backing rules still exist. This cleanup also runs automatically each day.',
            })}
          </p>
        </EuiText>
        <EuiSpacer />
        <EuiButton
          data-test-subj="streams-settings-stale-event-cleanup-button"
          iconType="broom"
          isLoading={isCleaningUp}
          isDisabled={!canManage || isCleaningUp}
          onClick={cleanupStaleEvents}
        >
          {i18n.translate('xpack.significantEventsApp.settings.staleEventCleanup.buttonLabel', {
            defaultMessage: 'Clean up stale events',
          })}
        </EuiButton>
      </EuiSplitPanel.Inner>
    </EuiSplitPanel.Outer>
  );
}
