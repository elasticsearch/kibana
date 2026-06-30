/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useInterval from 'react-use/lib/useInterval';
import {
  EuiBadge,
  EuiButton,
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
import type { SignificantEvent } from '@kbn/significant-events-schema';
import { useFetchSignificantEventLifecycle } from '../../../../../hooks/significant_events/use_fetch_significant_event_lifecycle';
import { useKibana } from '../../../../../hooks/use_kibana';
import { useTriggerInvestigation } from '../../../../../hooks/significant_events/use_trigger_investigation';
import { LifecycleTimeline } from './lifecycle_timeline';
import { getSignificantEventStatusColor } from '../shared/status_display';
import { SIGNIFICANT_EVENT_STATUS_LABELS } from '../shared/translations';
import { formatTimestamp } from '../../../../../util/formatters';
import { SigEventDetails } from '../../../significant_event_details/sig_event_details';
import { EventInvestigations } from './event_investigations';
import { hasPendingInvestigation } from '../shared/investigation_status';
import { RUNNING_POLL_INTERVAL_MS } from '../../../constants';

const LIFECYCLE_TITLE = i18n.translate('xpack.streams.sigEventsTab.flyout.lifecycleTitle', {
  defaultMessage: 'Lifecycle',
});
const LIFECYCLE_ERROR = i18n.translate('xpack.streams.sigEventsTab.flyout.lifecycleError', {
  defaultMessage: 'Failed to load lifecycle data',
});
const CLOSE_LABEL = i18n.translate('xpack.streams.sigEventsTab.flyout.close', {
  defaultMessage: 'Close',
});

const RUN_LABEL = i18n.translate('xpack.streams.sigEventsTab.runInvestigationButton.label', {
  defaultMessage: 'Run investigation',
});
const CRITICALITY_LABEL = i18n.translate('xpack.streams.sigEventsTab.flyout.criticalityLabel', {
  defaultMessage: 'Criticality',
});
const CONFIDENCE_LABEL = i18n.translate('xpack.streams.sigEventsTab.flyout.confidenceLabel', {
  defaultMessage: 'Confidence',
});

interface SignificantEventFlyoutProps {
  event: SignificantEvent;
  onClose: () => void;
}

export const SignificantEventFlyout = ({ event, onClose }: SignificantEventFlyoutProps) => {
  const {
    services: { focusedSignificantEventService },
  } = useKibana();
  const {
    data: lifecycleData,
    isLoading: isLifecycleLoading,
    isError: isLifecycleError,
    refetch: refetchLifecycle,
  } = useFetchSignificantEventLifecycle(event.event_id);

  const flyoutTitleId = useGeneratedHtmlId({ prefix: 'significantEventFlyout' });

  // Use the latest event version from the lifecycle response — lifecycle fetches all
  // versions via findByDiscoverySlug (no time filter), so it captures newly-written
  // versions that fall outside the time-filtered list query used by the parent table.
  const latestEvent = useMemo(() => lifecycleData?.events.at(-1) ?? event, [lifecycleData, event]);

  // Poll lifecycle while a pending investigation is in progress, or briefly after the
  // footer button triggers one (the async workflow step may not have written back yet).
  const [isPollingAfterTrigger, setIsPollingAfterTrigger] = useState(false);
  const triggerPollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (hasPendingInvestigation(latestEvent) && isPollingAfterTrigger) {
      setIsPollingAfterTrigger(false);
      clearTimeout(triggerPollTimeoutRef.current);
    }
  }, [latestEvent, isPollingAfterTrigger]);

  useEffect(() => () => clearTimeout(triggerPollTimeoutRef.current), []);

  const onTriggerSuccess = useCallback(() => {
    setIsPollingAfterTrigger(true);
    clearTimeout(triggerPollTimeoutRef.current);
    triggerPollTimeoutRef.current = setTimeout(() => setIsPollingAfterTrigger(false), 30_000);
  }, []);

  const { triggerInvestigation, isTriggering } = useTriggerInvestigation({ onTriggerSuccess });

  useInterval(
    refetchLifecycle,
    isPollingAfterTrigger || hasPendingInvestigation(latestEvent) ? RUNNING_POLL_INTERVAL_MS : null
  );

  useEffect(() => {
    focusedSignificantEventService.setFocusedEvent(latestEvent);

    return () => {
      focusedSignificantEventService.clearFocusedEvent(latestEvent.discovery_slug);
    };
  }, [latestEvent, focusedSignificantEventService]);

  return (
    <EuiFlyout onClose={onClose} size="m" aria-labelledby={flyoutTitleId}>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiBadge color={getSignificantEventStatusColor(event.status)}>
                {SIGNIFICANT_EVENT_STATUS_LABELS[event.status]}
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

          <EventInvestigations event={latestEvent} />

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
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>{CLOSE_LABEL}</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              iconType="inspect"
              onClick={() => {
                if (!isTriggering) triggerInvestigation(latestEvent.event_id);
              }}
              isDisabled={isTriggering}
              isLoading={isTriggering}
              fill
              size="s"
              data-test-subj="sigEventRunInvestigationButton"
            >
              {RUN_LABEL}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
