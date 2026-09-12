/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { SourceNode as SourceNodeType } from '../types';
import { SOURCE_NODE_WIDTH } from '../canvas_constants';
import { getNodeCardStyles } from './node_card_styles';

// TODO: Replace with EuiIcon type="logIn" after Kibana picks up elastic/eui#9885.
const UnconfiguredSourceIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="square"
    strokeLinejoin="miter"
    aria-hidden
  >
    <path d="M5 2v4M2 8h12m-4-4 4 4-4 4m-5-2v4" />
  </svg>
);

export function SourceNode({ data, selected, dragging }: NodeProps<SourceNodeType>) {
  const { euiTheme } = useEuiTheme();
  const isUnconfigured = Boolean(data.unconfiguredNodeId);

  return (
    <>
      <EuiPanel
        // `nokey` stops React Flow from arming a marquee when a Shift+drag starts
        // on the card, so Shift+click multi-select stays stable.
        className="nokey"
        hasShadow={false}
        hasBorder
        paddingSize="m"
        data-test-subj="streamsCanvasSourceNode"
        css={getNodeCardStyles(euiTheme, {
          width: SOURCE_NODE_WIDTH,
          selected,
          dragging,
          danger: isUnconfigured,
        })}
      >
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiPanel
              hasShadow={false}
              hasBorder
              paddingSize="none"
              color="subdued"
              css={css`
                display: flex;
                align-items: center;
                justify-content: center;
                padding: ${isUnconfigured ? euiTheme.size.s : euiTheme.size.xxs};
              `}
            >
              {isUnconfigured ? (
                <UnconfiguredSourceIcon />
              ) : data.iconType ? (
                <EuiIcon type={data.iconType} size="s" aria-hidden={true} />
              ) : null}
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem
            grow
            css={css`
              overflow: hidden;
            `}
          >
            <EuiText size="s" data-test-subj="streamsCanvasNodeTitle">
              <strong>{data.title}</strong>
            </EuiText>
            <EuiText size="s" color="subdued">
              {data.subtitle}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
        {isUnconfigured && data.configurationLabel && (
          <>
            <EuiSpacer size="m" />
            <EuiText size="s" color="danger">
              {data.configurationLabel}
            </EuiText>
          </>
        )}
      </EuiPanel>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}
