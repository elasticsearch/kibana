/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ExecutionAbortedEvent } from '@kbn/agent-builder-common/chat/timeline_events';

interface ExecutionAbortedProps {
  event: ExecutionAbortedEvent;
}

/** Renders a muted indicator when a run was stopped before it completed. */
export const ExecutionAborted: React.FC<ExecutionAbortedProps> = ({ event }) => {
  const { aborted_by: abortedBy } = event.data;

  const label = abortedBy?.username ?? abortedBy?.full_name ?? abortedBy?.id;

  return (
    <EuiText color="subdued" size="s">
      {label
        ? i18n.translate('xpack.agentBuilder.conversation.timeline.executionAborted.stoppedBy', {
            defaultMessage: 'Response stopped by {actor}',
            values: { actor: label },
          })
        : i18n.translate('xpack.agentBuilder.conversation.timeline.executionAborted.stopped', {
            defaultMessage: 'Response stopped',
          })}
    </EuiText>
  );
};
