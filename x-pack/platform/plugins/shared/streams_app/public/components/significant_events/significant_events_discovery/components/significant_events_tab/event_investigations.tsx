/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import moment from 'moment';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiText, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type {
  SignificantEvent,
  SignificantEventInvestigation,
} from '@kbn/significant-events-schema';
import { formatTimestamp } from '../../../../../util/formatters';
import {
  INVESTIGATION_STATUS_COLORS,
  INVESTIGATION_STATUS_LABELS,
} from '../shared/investigation_status';

const SECTION_TITLE = i18n.translate(
  'xpack.streams.sigEventsTab.flyout.investigationsSectionTitle',
  {
    defaultMessage: 'Investigations',
  }
);

const NO_INVESTIGATIONS_TEXT = i18n.translate(
  'xpack.streams.sigEventsTab.flyout.noInvestigations',
  {
    defaultMessage: 'No investigations yet.',
  }
);

const formatDuration = (startedAt: string, completedAt?: string): string => {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  return moment.duration(diffMs).humanize();
};

const InvestigationRow = ({ investigation }: { investigation: SignificantEventInvestigation }) => {
  const { status, started_at, completed_at } = investigation;
  const duration = formatDuration(started_at, completed_at);
  const isRunning = status === 'pending';

  return (
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiBadge color={INVESTIGATION_STATUS_COLORS[status]}>
          {INVESTIGATION_STATUS_LABELS[status]}
        </EuiBadge>
      </EuiFlexItem>
      <EuiFlexItem grow>
        <EuiText size="xs" color="subdued">
          {formatTimestamp(started_at)}
          {isRunning ? ` · ${duration} (running)` : completed_at ? ` · ${duration}` : null}
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

interface EventInvestigationsProps {
  event: SignificantEvent;
}

export const EventInvestigations = ({ event }: EventInvestigationsProps) => {
  const investigations = event.investigations ?? [];

  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      <EuiFlexItem grow={false}>
        <EuiTitle size="xs">
          <h3>{SECTION_TITLE}</h3>
        </EuiTitle>
      </EuiFlexItem>
      {investigations.length === 0 ? (
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued">
            <p>{NO_INVESTIGATIONS_TEXT}</p>
          </EuiText>
        </EuiFlexItem>
      ) : (
        investigations.map((investigation) => (
          <EuiFlexItem key={investigation.workflow_execution_id} grow={false}>
            <InvestigationRow investigation={investigation} />
          </EuiFlexItem>
        ))
      )}
    </EuiFlexGroup>
  );
};
