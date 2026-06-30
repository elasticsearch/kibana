/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge, EuiLink, EuiToolTip } from '@elastic/eui';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { WORKFLOWS_APP_ID } from '@kbn/deeplinks-workflows';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { useFetchWorkflow } from '../../hooks/use_fetch_workflow';

interface WorkflowDestinationLinkProps {
  id: string;
  /** When provided, renders immediately without fetching. */
  name?: string;
  isDraft?: boolean;
  /** Controls whether the DI-based fetch is enabled (only relevant when `name` is omitted). */
  isEnabled?: boolean;
}

/**
 * Renders a workflow destination as a clickable link or a "Draft" badge.
 * Requires DI context — gets `application` via `useService`.
 * When `name` is omitted, fetches the workflow name via `useFetchWorkflow`.
 */
export const WorkflowDestinationLink = ({
  id,
  name,
  isDraft = false,
  isEnabled = true,
}: WorkflowDestinationLinkProps) => {
  if (name !== undefined) {
    return <WorkflowLink id={id} name={name} isDraft={isDraft} />;
  }
  return <FetchingWorkflowLink id={id} isEnabled={isEnabled} />;
};

const WorkflowLink = ({ id, name, isDraft }: { id: string; name: string; isDraft?: boolean }) => {
  const application = useService(CoreStart('application'));

  if (isDraft) {
    return (
      <>
        {name}{' '}
        <EuiBadge color="hollow">
          {i18n.translate('xpack.alertingV2.workflowDestinationLink.draft', {
            defaultMessage: 'Draft',
          })}
        </EuiBadge>
      </>
    );
  }

  return (
    <EuiToolTip
      content={name}
      position="top"
      anchorProps={{
        css: {
          display: 'inline-block',
          maxWidth: '100%',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          verticalAlign: 'bottom',
        },
      }}
    >
      <EuiLink
        href={application.getUrlForApp(WORKFLOWS_APP_ID, { path: `/${id}` })}
        target="_blank"
        rel="noopener noreferrer"
      >
        {name}
      </EuiLink>
    </EuiToolTip>
  );
};

const FetchingWorkflowLink = ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
  const { data: workflow } = useFetchWorkflow(id, isEnabled);
  return <WorkflowLink id={id} name={workflow?.name ?? id} />;
};
