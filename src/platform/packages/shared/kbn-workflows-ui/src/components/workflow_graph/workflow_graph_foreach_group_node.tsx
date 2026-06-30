/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiIcon } from '@elastic/eui';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import React, { memo, useState } from 'react';
import type { WorkflowStepExecutionDto } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';

interface ForeachGroupNodeData extends Record<string, unknown> {
  readonly label: string;
  /** The original step type (e.g. `'foreach'`, `'while'`). */
  readonly stepType: string;
  /** Optional execution status threaded through from the canvas. */
  readonly stepExecution?: WorkflowStepExecutionDto;
}

// Figma "foreach" container (node 10791:11140).
const FIGMA_FOREACH_BORDER = '#bfdbff';
const FIGMA_FOREACH_HEADER_BG = '#f1f6ff';
const FIGMA_FOREACH_ICON_COLOR = '#61a2ff';
const FIGMA_FOREACH_LABEL_COLOR = '#111c2c';

// Figma "foreach" executed variant (node 11130:5900).
const FIGMA_FOREACH_EXECUTED_BORDER = '#a2e8e6';
const FIGMA_FOREACH_EXECUTED_HEADER_BG = '#e7f9f9';
const FIGMA_FOREACH_EXECUTED_ICON_COLOR = '#16c5c0';

// Figma "foreach" failed variant — reusing the danger palette already used by
// status icons on regular step rows so the two visuals read as one family.
const FIGMA_FOREACH_FAILED_BORDER = '#ffb3b3';
const FIGMA_FOREACH_FAILED_HEADER_BG = '#ffe5e5';
const FIGMA_FOREACH_FAILED_ICON_COLOR = '#bd271e';

// Figma Shadow/X-small composite — matches the hover variant (node 11130:5821).
const FOREACH_HOVER_SHADOW =
  '0 0 2px 0 rgba(43, 57, 79, 0.16), 0 1px 4px 0 rgba(43, 57, 79, 0.06), 0 2px 8px 0 rgba(43, 57, 79, 0.05)';

function WorkflowGraphForeachGroupNodeInner(node: NodeProps<Node<ForeachGroupNodeData>>) {
  const { label, stepExecution } = node.data;
  const targetHandlePos = node.targetPosition ?? Position.Top;
  const sourceHandlePos = node.sourcePosition ?? Position.Bottom;
  const [isHovered, setIsHovered] = useState(false);

  const execStatus = stepExecution?.status;
  const isSuccess = execStatus === ExecutionStatus.COMPLETED;
  const isFailed =
    execStatus === ExecutionStatus.FAILED ||
    execStatus === ExecutionStatus.TIMED_OUT ||
    execStatus === ExecutionStatus.CANCELLED;

  const borderColor = isSuccess
    ? FIGMA_FOREACH_EXECUTED_BORDER
    : isFailed
    ? FIGMA_FOREACH_FAILED_BORDER
    : FIGMA_FOREACH_BORDER;
  const headerBg = isSuccess
    ? FIGMA_FOREACH_EXECUTED_HEADER_BG
    : isFailed
    ? FIGMA_FOREACH_FAILED_HEADER_BG
    : FIGMA_FOREACH_HEADER_BG;
  const iconColor = isSuccess
    ? FIGMA_FOREACH_EXECUTED_ICON_COLOR
    : isFailed
    ? FIGMA_FOREACH_FAILED_ICON_COLOR
    : FIGMA_FOREACH_ICON_COLOR;

  return (
    <>
      <Handle type="target" position={targetHandlePos} style={{ opacity: 0 }} />
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        css={{
          width: '100%',
          height: '100%',
          // ~10% white so the canvas's dot pattern shows through and the
          // container body reads as a soft outline rather than a solid panel.
          background: 'rgba(255, 255, 255, 0.1)',
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          position: 'relative',
          transition: 'border-color 120ms ease',
        }}
      >
        {/* Full-width header with refresh icon + label. Sized to match
            GROUP_PADDING_TOP in apply_graph_layout.ts so inner nodes sit
            just below the header. */}
        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '8px 16px',
            background: headerBg,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottom: `1px solid ${borderColor}`,
            fontFamily:
              '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 12,
            fontWeight: 500,
            color: FIGMA_FOREACH_LABEL_COLOR,
            lineHeight: '24px',
            // Hover lifts the header chip; Figma applies the shadow to the
            // header strip only, not the entire container body.
            boxShadow: isHovered ? FOREACH_HOVER_SHADOW : 'none',
            transition: 'box-shadow 120ms ease, background 120ms ease',
          }}
        >
          <EuiIcon type="refresh" size="m" color={iconColor} aria-hidden />
          <span
            css={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
            title={label}
          >
            {label}
          </span>
        </div>
      </div>
      <Handle type="source" position={sourceHandlePos} style={{ opacity: 0 }} />
    </>
  );
}

export const WorkflowGraphForeachGroupNode = memo(WorkflowGraphForeachGroupNodeInner);
