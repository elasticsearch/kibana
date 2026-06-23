/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiCodeBlock,
  EuiDescriptionList,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import React, { useMemo } from 'react';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import { i18n } from '@kbn/i18n';

export interface WorkflowExecutionDetailFlyoutProps {
  hit: DataTableRecord;
  onClose: () => void;
}

const formatValue = (value: unknown): string => {
  if (value == null) {
    return '\u2014';
  }
  if (Array.isArray(value)) {
    return value.length === 1 ? formatValue(value[0]) : value.map(formatValue).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

const SUMMARY_FIELDS: ReadonlyArray<{ field: string; label: string }> = [
  {
    field: 'id',
    label: i18n.translate('workflowsManagement.executionsPage.flyoutFieldId', {
      defaultMessage: 'Execution ID',
    }),
  },
  {
    field: 'workflowId',
    label: i18n.translate('workflowsManagement.executionsPage.flyoutFieldWorkflow', {
      defaultMessage: 'Workflow',
    }),
  },
  {
    field: 'status',
    label: i18n.translate('workflowsManagement.executionsPage.flyoutFieldStatus', {
      defaultMessage: 'Status',
    }),
  },
  {
    field: 'startedAt',
    label: i18n.translate('workflowsManagement.executionsPage.flyoutFieldStarted', {
      defaultMessage: 'Started at',
    }),
  },
  {
    field: 'finishedAt',
    label: i18n.translate('workflowsManagement.executionsPage.flyoutFieldFinished', {
      defaultMessage: 'Finished at',
    }),
  },
  {
    field: 'triggeredBy',
    label: i18n.translate('workflowsManagement.executionsPage.flyoutFieldTriggeredBy', {
      defaultMessage: 'Triggered by',
    }),
  },
  {
    field: 'executedBy',
    label: i18n.translate('workflowsManagement.executionsPage.flyoutFieldExecutedBy', {
      defaultMessage: 'Executed by',
    }),
  },
];

export const WorkflowExecutionDetailFlyout = React.memo<WorkflowExecutionDetailFlyoutProps>(
  ({ hit, onClose }) => {
    const flyoutTitleId = useGeneratedHtmlId({ prefix: 'workflowExecutionDetailFlyoutTitle' });

    const summary = useMemo(
      () =>
        SUMMARY_FIELDS.map(({ field, label }) => ({
          title: label,
          description: formatValue(hit.flattened[field]),
        })),
      [hit.flattened]
    );

    const rawJson = useMemo(
      () => JSON.stringify(hit.raw?._source ?? hit.flattened, null, 2),
      [hit.flattened, hit.raw]
    );

    return (
      <EuiFlyout
        aria-labelledby={flyoutTitleId}
        data-test-subj="workflowExecutionDetailFlyout"
        onClose={onClose}
        ownFocus
        size="m"
      >
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h2 id={flyoutTitleId}>
              {i18n.translate('workflowsManagement.executionsPage.flyoutTitle', {
                defaultMessage: 'Execution details',
              })}
            </h2>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiText color="subdued" size="xs">
            <code>{hit.flattened.id ? formatValue(hit.flattened.id) : hit.id}</code>
          </EuiText>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiDescriptionList compressed listItems={summary} type="column" />
          <EuiSpacer size="m" />
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('workflowsManagement.executionsPage.flyoutRawJsonTitle', {
                defaultMessage: 'Raw document',
              })}
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiCodeBlock
            fontSize="s"
            isCopyable
            language="json"
            overflowHeight={400}
            paddingSize="s"
          >
            {rawJson}
          </EuiCodeBlock>
        </EuiFlyoutBody>
      </EuiFlyout>
    );
  }
);
WorkflowExecutionDetailFlyout.displayName = 'WorkflowExecutionDetailFlyout';
