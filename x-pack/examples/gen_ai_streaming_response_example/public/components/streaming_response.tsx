/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiAccordion,
  EuiPanel,
  EuiSpacer,
  EuiText,
  useEuiTheme,
  EuiLoadingSpinner,
  EuiIcon,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { CoreStart } from '@kbn/core/public';
import { useFetchStream } from '@kbn/ml-response-stream/client';

export interface StreamingResponseProps {
  http: CoreStart['http'];
  prompt: string;
  selectedConnectorId: string;
  initialIsOpen?: boolean;
}
interface ChunkChoice {
  index: 0;
  delta: { role: string; content: string };
  finish_reason: null | string;
}

interface Chunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChunkChoice[];
}

const cursorCss = `
  @keyframes blink {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  animation: blink 1s infinite;
  width: 10px;
  height: 16px;
  vertical-align: middle;
  display: inline-block;
  background: rgba(0, 0, 0, 0.25);
`;

export const StreamingResponse = ({
  http,
  prompt,
  selectedConnectorId,
  initialIsOpen = false,
}: StreamingResponseProps) => {
  const { euiTheme } = useEuiTheme();
  const [hasOpened, setHasOpened] = useState(initialIsOpen);

  const { errors, start, cancel, data, isRunning } = useFetchStream(
    http,
    `/internal/examples/execute_gen_ai_connector`,
    undefined,
    {
      connector_id: selectedConnectorId,
      prompt,
    },
    { reducer: streamReducer, initialState: '' }
  );

  // Start fetching when the accordion was opened
  useEffect(() => {
    if (hasOpened && !isRunning && errors.length === 0 && data === '') {
      start();
    }
  }, [data, errors, hasOpened, isRunning, start]);

  // Cancel fetching when the component unmounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => cancel, []);

  let content = data;

  let state: 'init' | 'loading' | 'streaming' | 'error' | 'complete' = 'init';

  if (isRunning) {
    state = content ? 'streaming' : 'loading';
  } else if (errors.length > 0) {
    state = 'error';
    content = errors.join('\n');
  } else if (content) {
    state = 'complete';
  }

  let inner: React.ReactElement;

  if (state === 'complete' || state === 'streaming') {
    inner = (
      <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {content}
        {state === 'streaming' ? <span className={cursorCss} /> : <></>}
      </p>
    );
  } else if (state === 'init' || state === 'loading') {
    inner = (
      <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="s" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            {i18n.translate('xpack.observability.coPilotPrompt.chatLoading', {
              defaultMessage: 'Waiting for a response...',
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  } else {
    inner = (
      <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiIcon color="danger" type="warning" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s">{content}</EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  return (
    <EuiPanel color="primary">
      <EuiAccordion
        id={`streamingResponse`}
        buttonContent={
          <EuiFlexGroup direction="row" alignItems="center">
            <EuiFlexItem grow>
              <EuiText size="m" color={euiTheme.colors.textPrimary}>
                <strong>
                  {i18n.translate(
                    'genAiStreamingResponseExample.app.component.streamingResponseTitle',
                    {
                      defaultMessage: 'Stream Response',
                    }
                  )}
                </strong>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        }
        initialIsOpen={initialIsOpen}
        onToggle={() => {
          setHasOpened(true);
        }}
      >
        <EuiSpacer size="s" />
        {inner}
      </EuiAccordion>
    </EuiPanel>
  );
};

function streamReducer(state: string, action: Chunk | Chunk[]) {
  return `${state}${[action]
    .flat()
    .map((chunk) => chunk.choices[0]?.delta.content ?? '')
    .join('')}`;
}
