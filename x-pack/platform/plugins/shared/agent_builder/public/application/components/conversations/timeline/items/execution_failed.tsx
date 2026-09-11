/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCallOut } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ExecutionFailedEvent } from '@kbn/agent-builder-common/chat/timeline_events';

interface ExecutionFailedProps {
  event: ExecutionFailedEvent;
}

/** Renders a danger callout for a run that ended in an error (`execution_failed`). */
export const ExecutionFailed: React.FC<ExecutionFailedProps> = ({ event }) => {
  const { error } = event.data;

  return (
    <EuiCallOut
      title={i18n.translate('xpack.agentBuilder.conversation.timeline.executionFailed.title', {
        defaultMessage: 'The agent run failed',
      })}
      color="danger"
      iconType="error"
    >
      {error.message && <p>{error.message}</p>}
    </EuiCallOut>
  );
};
