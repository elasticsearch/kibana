/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { EuiButtonIcon, EuiPanel, EuiText, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DestinationNode as DestinationNodeType } from '../types';
import { DESTINATION_NODE_WIDTH } from '../canvas_constants';
import { getNodeCardStyles } from './node_card_styles';

const processingLabel = i18n.translate('xpack.streams.canvas.destinationNode.processingLabel', {
  defaultMessage: 'Processing',
});

export function DestinationNode({ data, selected, dragging }: NodeProps<DestinationNodeType>) {
  const { euiTheme } = useEuiTheme();

  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <EuiPanel
        // `nokey` stops React Flow from arming a marquee when a Shift+drag starts
        // on the card, so Shift+click multi-select stays stable.
        className="nokey"
        hasShadow={false}
        hasBorder
        paddingSize="m"
        data-test-subj="streamsCanvasDestinationNode"
        css={getNodeCardStyles(euiTheme, { width: DESTINATION_NODE_WIDTH, selected, dragging })}
      >
        <div
          css={css`
            display: flex;
            align-items: flex-start;
            gap: ${euiTheme.size.s};
          `}
        >
          <EuiText
            size="xs"
            data-test-subj="streamsCanvasNodeTitle"
            css={css`
              flex: 1 1 auto;
              min-width: 0;
              overflow-wrap: anywhere;
            `}
          >
            <strong>{data.title}</strong>
          </EuiText>
          {data.hasProcessing && (
            <EuiToolTip content={processingLabel} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="processor"
                size="xs"
                color="text"
                aria-label={processingLabel}
                data-test-subj="streamsCanvasProcessingButton"
                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  data.onProcessingClick?.(data.streamName);
                }}
              />
            </EuiToolTip>
          )}
        </div>
      </EuiPanel>
    </>
  );
}
