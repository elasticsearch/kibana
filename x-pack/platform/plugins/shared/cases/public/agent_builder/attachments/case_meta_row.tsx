/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { getStatusConfiguration } from '@kbn/cases-components';

import type { CaseAttachmentData } from '../../../common/types/agent_builder/attachment_schemas';
import { VIEW_ALERTS, VIEW_COMMENTS } from './translations';
import type { getCaseUrls } from './route_helpers';

const statusConfig = getStatusConfiguration();

interface Props {
  data: CaseAttachmentData;
  caseUrls: ReturnType<typeof getCaseUrls>;
}

export const CaseMetaRow: React.FC<Props> = ({ data, caseUrls }) => {
  const statusEntry = statusConfig[data.status as keyof typeof statusConfig];
  return (
    <EuiFlexGroup gutterSize="s" wrap responsive={false} alignItems="center">
      {data.totalAlerts > 0 && (
        <EuiFlexItem grow={false}>
          <EuiBadge
            color="danger"
            iconType="warning"
            href={caseUrls.attachmentsTab}
            target="_blank"
            aria-label={VIEW_ALERTS}
          >
            {data.totalAlerts}
          </EuiBadge>
        </EuiFlexItem>
      )}
      {statusEntry && (
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">{statusEntry.label}</EuiBadge>
        </EuiFlexItem>
      )}
      {data.assignees && data.assignees.length > 0 && (
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow" iconType="users">
            {data.assignees.length}
          </EuiBadge>
        </EuiFlexItem>
      )}
      {data.totalComment > 0 && (
        <EuiFlexItem grow={false}>
          <EuiBadge
            color="hollow"
            iconType="editorComment"
            href={caseUrls.activityTab}
            target="_blank"
            aria-label={VIEW_COMMENTS}
          >
            {data.totalComment}
          </EuiBadge>
        </EuiFlexItem>
      )}
      {!!data.totalAttachments && (
        <EuiFlexItem grow={false}>
          <EuiBadge
            color="hollow"
            iconType="paperClip"
            href={caseUrls.attachmentsTab}
            target="_blank"
          >
            {data.totalAttachments}
          </EuiBadge>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
CaseMetaRow.displayName = 'CaseMetaRow';
