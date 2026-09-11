/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo, useState } from 'react';
import {
  EuiButtonEmpty,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiBasicTable,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { getLatestVersion } from '@kbn/agent-builder-common';
import type { Conversation } from '@kbn/agent-builder-common';
import type { AttachmentServiceStartContract } from '@kbn/agent-builder-browser';
import type { Investigation } from '../../types';
import { DetailsBlock } from './detail_block';
import { DETAILS_FLYOUT_LABELS } from './translations';
import { TimelineEventList } from '../timeline';

const getColumns = () => {
  const cellContent = (value: string) => (
    <EuiText size="xs" color="subdued">
      {value}
    </EuiText>
  );

  return [
    {
      field: 'field',
      name: DETAILS_FLYOUT_LABELS.overview.fieldColumn,
      render: (field: string) => cellContent(field),
    },
    {
      field: 'value',
      name: DETAILS_FLYOUT_LABELS.overview.valueColumn,
      render: (value: string) => cellContent(value),
    },
  ];
};

const SUMMARY_LIMIT = 120;

export const OverviewTab = memo<{ investigation: Investigation }>(({ investigation }) => {
  const { euiTheme } = useEuiTheme();
  const { summary, affectedSurface, severity } = investigation;
  const [expanded, setExpanded] = useState(false);

  const isCondensed = summary != null && summary.length > SUMMARY_LIMIT;
  const displayedSummary =
    isCondensed && !expanded ? `${summary.slice(0, SUMMARY_LIMIT)}...` : summary;

  interface ImpactRow {
    field: string;
    value: string;
  }
  const impactRows: ImpactRow[] = [
    affectedSurface
      ? { field: DETAILS_FLYOUT_LABELS.overview.compromised, value: affectedSurface }
      : null,
    severity ? { field: DETAILS_FLYOUT_LABELS.overview.severity, value: severity } : null,
  ].filter((row): row is ImpactRow => row !== null);

  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      {summary && (
        <EuiFlexItem>
          <DetailsBlock title={DETAILS_FLYOUT_LABELS.sections.overview}>
            <EuiText size="s" color="subdued">
              <p>{displayedSummary}</p>
            </EuiText>
            {isCondensed && (
              <div>
                <EuiButtonEmpty size="s" flush="left" onClick={() => setExpanded((prev) => !prev)}>
                  {expanded
                    ? DETAILS_FLYOUT_LABELS.overview.showLess
                    : DETAILS_FLYOUT_LABELS.overview.showMore}
                </EuiButtonEmpty>
              </div>
            )}
          </DetailsBlock>
        </EuiFlexItem>
      )}

      {impactRows.length > 0 && (
        <EuiFlexItem>
          <DetailsBlock title={DETAILS_FLYOUT_LABELS.sections.impact}>
            <EuiPanel hasBorder paddingSize="none" style={{ borderRadius: euiTheme.size.s }}>
              <EuiBasicTable
                tableCaption={DETAILS_FLYOUT_LABELS.overview.tableCaption}
                rowHeader="field"
                items={impactRows}
                columns={getColumns()}
                tableLayout="auto"
              />
            </EuiPanel>
          </DetailsBlock>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
});
OverviewTab.displayName = 'OverviewTab';

export interface AttachmentsTabProps {
  conversation: Conversation;
  /** Captured at registration; flyout slots cannot reach services through context. */
  attachmentsService: AttachmentServiceStartContract;
}

/**
 * Renders the conversation's attachments through the UI definitions their owning plugins
 * registered with Agent Builder. Attachment types without a details renderer are skipped.
 */
export const AttachmentsTab = memo<AttachmentsTabProps>(({ conversation, attachmentsService }) => {
  const { attachments } = conversation;

  const renderedAttachments = useMemo(
    () =>
      (attachments ?? [])
        .filter(({ hidden }) => !hidden)
        .flatMap((attachment) => {
          const definition = attachmentsService.getAttachmentUiDefinition(attachment.type);

          if (!definition?.renderConversationDetailsContent) {
            return [];
          }

          const latestVersion = getLatestVersion(attachment);

          if (!latestVersion) {
            return [];
          }

          const { id, type, description, hidden, origin, versions } = attachment;
          // Shape is checked structurally against the render props at the call sites below;
          // `UnknownAttachment` is only reachable through a subpath import.
          const flattened = {
            id,
            type,
            data: latestVersion.data,
            description,
            hidden,
            origin,
            versionData: {
              version: latestVersion.version,
              versionCount: versions.length,
              createdAt: latestVersion.created_at,
            },
          };

          return [
            {
              id,
              title: definition.getLabel(flattened),
              content: definition.renderConversationDetailsContent({ attachment: flattened }),
            },
          ];
        }),
    [attachments, attachmentsService]
  );

  if (renderedAttachments.length === 0) {
    return (
      <EuiEmptyPrompt
        iconType="paperClip"
        title={<h3>{DETAILS_FLYOUT_LABELS.attachments.emptyTitle}</h3>}
        body={
          <EuiText size="s" color="subdued">
            <p>{DETAILS_FLYOUT_LABELS.attachments.emptyBody}</p>
          </EuiText>
        }
      />
    );
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      {renderedAttachments.map(({ id, title, content }) => (
        <EuiFlexItem key={id}>
          <DetailsBlock title={title}>{content}</DetailsBlock>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
});
AttachmentsTab.displayName = 'AttachmentsTab';

export const TimelineTab = memo<{ events: Investigation['events'] }>(({ events }) => (
  <EuiFlexGroup direction="column" gutterSize="s">
    <EuiFlexItem>
      <EuiFlexGroup direction="row" gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{DETAILS_FLYOUT_LABELS.sections.timeline}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <span>{events.length}</span>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
    <EuiFlexItem>
      <TimelineEventList events={events} />
    </EuiFlexItem>
  </EuiFlexGroup>
));
TimelineTab.displayName = 'TimelineTab';
