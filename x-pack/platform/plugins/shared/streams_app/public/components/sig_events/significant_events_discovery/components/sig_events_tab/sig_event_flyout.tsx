/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiLoadingSpinner,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { SigEvent } from '@kbn/streams-schema';
import { useFetchEventLifecycle } from '../../../../../hooks/sig_events/use_fetch_sig_events';
import { useKibana } from '../../../../../hooks/use_kibana';
import { LifecycleTimeline } from './lifecycle_timeline';
import { getSigEventStatusColor } from '../shared/status_display';
import { SIG_EVENT_STATUS_LABELS } from '../shared/translations';
import { formatTimestamp } from '../../../../../util/formatters';
import { SigEventDetails } from '../../../sig_event_details/sig_event_details';

const LIFECYCLE_TITLE = i18n.translate('xpack.streams.sigEventsTab.flyout.lifecycleTitle', {
  defaultMessage: 'Lifecycle',
});
const LIFECYCLE_ERROR = i18n.translate('xpack.streams.sigEventsTab.flyout.lifecycleError', {
  defaultMessage: 'Failed to load lifecycle data',
});
const CLOSE_LABEL = i18n.translate('xpack.streams.sigEventsTab.flyout.close', {
  defaultMessage: 'Close',
});
const CRITICALITY_LABEL = i18n.translate('xpack.streams.sigEventsTab.flyout.criticalityLabel', {
  defaultMessage: 'Criticality',
});
const CONFIDENCE_LABEL = i18n.translate('xpack.streams.sigEventsTab.flyout.confidenceLabel', {
  defaultMessage: 'Confidence',
});

interface SigEventFlyoutProps {
  event: SigEvent;
  onClose: () => void;
}

export const SigEventFlyout = ({ event, onClose }: SigEventFlyoutProps) => {
  const {
    services: { focusedSignificantEventService },
  } = useKibana();
  const {
    data: lifecycleData,
    isLoading: isLifecycleLoading,
    isError: isLifecycleError,
  } = useFetchEventLifecycle(event.event_id);

  const flyoutTitleId = useGeneratedHtmlId({ prefix: 'sigEventFlyout' });

  useEffect(() => {
    focusedSignificantEventService.setFocusedEvent(event);

    return () => {
      focusedSignificantEventService.clearFocusedEvent(event.discovery_slug);
    };
  }, [event, focusedSignificantEventService]);

  return (
    <EuiFlyout onClose={onClose} size="m" aria-labelledby={flyoutTitleId}>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiBadge color={getSigEventStatusColor(event.status)}>
                {SIG_EVENT_STATUS_LABELS[event.status]}
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiTitle size="m">
            <h2 id={flyoutTitleId}>{event.title}</h2>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            {formatTimestamp(event['@timestamp'])}
            {event.criticality != null && ` · ${CRITICALITY_LABEL}: ${event.criticality}`}
            {event.confidence != null && ` · ${CONFIDENCE_LABEL}: ${event.confidence}%`}
          </EuiText>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiFlexGroup direction="column" gutterSize="m">
          <SigEventDetails event={event} />

          <EuiHorizontalRule margin="none" />

          <EuiFlexGroup direction="column" gutterSize="s">
            <EuiTitle size="xs">
              <h3>{LIFECYCLE_TITLE}</h3>
            </EuiTitle>
            {isLifecycleLoading ? (
              <EuiLoadingSpinner size="m" />
            ) : isLifecycleError ? (
              <EuiCallOut
                announceOnMount
                title={LIFECYCLE_ERROR}
                color="danger"
                iconType="error"
                size="s"
              />
            ) : (
              <LifecycleTimeline data={lifecycleData} />
            )}
          </EuiFlexGroup>
        </EuiFlexGroup>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiButtonEmpty onClick={onClose}>{CLOSE_LABEL}</EuiButtonEmpty>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
