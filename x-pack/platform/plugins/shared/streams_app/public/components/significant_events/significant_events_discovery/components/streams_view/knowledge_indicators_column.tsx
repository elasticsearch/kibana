/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiI18nNumber, EuiText } from '@elastic/eui';
import { css } from '@emotion/css';
import type { Streams } from '@kbn/streams-schema';
import type { SignificantEventsWorkflowStatusResult } from '@kbn/significant-events-schema';
import React from 'react';
import { useStreamFeatures } from '../../../../../hooks/significant_events/use_stream_features';

interface KnowledgeIndicatorsColumnProps {
  stream: Streams.all.Definition;
  streamOnboardingResult?: SignificantEventsWorkflowStatusResult;
}

export function KnowledgeIndicatorsColumn({
  stream,
  streamOnboardingResult,
}: KnowledgeIndicatorsColumnProps) {
  const { features } = useStreamFeatures(stream, [streamOnboardingResult]);

  return (
    <EuiText
      size="s"
      className={css`
        text-align: center;
        font-family: 'Roboto Mono', monospace;
      `}
    >
      {features.length ? <EuiI18nNumber value={features.length} /> : '—'}
    </EuiText>
  );
}
