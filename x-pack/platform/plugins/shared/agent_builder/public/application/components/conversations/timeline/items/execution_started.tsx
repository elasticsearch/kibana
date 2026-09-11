/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import type { ExecutionStartedEvent } from '@kbn/agent-builder-common/chat/timeline_events';

interface ExecutionStartedProps {
  event: ExecutionStartedEvent;
}

/** Non-visual: exists so the timeline switch handles every event type exhaustively. */
export const ExecutionStarted: React.FC<ExecutionStartedProps> = (_props) => {
  return null;
};
