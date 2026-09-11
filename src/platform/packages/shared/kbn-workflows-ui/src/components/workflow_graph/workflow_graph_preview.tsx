/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiIcon, EuiText } from '@elastic/eui';
import { ReactFlowProvider } from '@xyflow/react';
import React, { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { LayoutDirection, TransformResult, WorkflowYaml } from '@kbn/workflows';
import { collectAllSteps, transformWorkflowToGraph } from '@kbn/workflows';
import type { RenderStepIcon } from './workflow_graph_actions_context';
import { WorkflowGraphCanvasWithoutProvider } from './workflow_graph_canvas';

export interface WorkflowGraphPreviewProps {
  readonly workflow: WorkflowYaml;
  /** Preview width. Number is treated as px; string is used verbatim. Defaults to `'100%'`. */
  readonly width?: number | string;
  /** Preview height in px. Defaults to 320 (dense inline preview). */
  readonly height?: number;
  /** Optional icon renderer forwarded to the underlying canvas nodes. */
  readonly renderStepIcon?: RenderStepIcon;
  /** Maximum number of steps to render before showing a placeholder. */
  readonly maxSteps?: number;
  /** Layout direction. Defaults to `'LR'` (horizontal) — denser for inline previews. */
  readonly direction?: LayoutDirection;
  /** Rank separation (arrow length in layout direction). Defaults to a tight 32px. */
  readonly rankSep?: number;
  /** Node separation (gap between siblings in a rank). Defaults to 24px. */
  readonly nodeSep?: number;
  /** Per-node width used by dagre. Defaults to 200px (denser than the editor's 300). */
  readonly nodeWidth?: number;
  /** Per-node height used by dagre. Defaults to 56px (denser than the editor's 64). */
  readonly nodeHeight?: number;
}

const isNonBypassNode = (style: { width: number; height: number }) =>
  style.width !== 1 || style.height !== 1;

const DEFAULT_MAX_PREVIEW_STEPS = 11;

const noop = () => {};

/**
 * Compact, static graph preview suitable for inline attachment previews or
 * popovers. Renders the same `WorkflowGraphCanvas` in `previewMode` — icon-only
 * nodes, no minimap, no banner, no interaction, autofit.
 *
 * Workflows with more than `maxSteps` total steps (including nested steps
 * inside loops) show a "too large to preview" placeholder instead.
 *
 * Callers are responsible for handling YAML parse errors before invoking this
 * component; the preview always receives an already-parsed `WorkflowYaml`.
 */
export function WorkflowGraphPreview({
  workflow,
  width = '100%',
  height = 240,
  renderStepIcon,
  maxSteps = DEFAULT_MAX_PREVIEW_STEPS,
  direction = 'LR',
  rankSep = 32,
  nodeSep = 24,
  nodeWidth = 200,
  nodeHeight = 56,
}: WorkflowGraphPreviewProps) {
  const totalSteps = collectAllSteps(workflow.steps ?? []).length;
  const tooLarge = totalSteps > maxSteps;

  // Precompute the transform and override every non-bypass node's dimensions
  // so dagre packs them tightly. Bypass-lane placeholders (1x1) are left
  // untouched — they're layout hints, not visible nodes.
  const transformed = useMemo<TransformResult | undefined>(() => {
    if (tooLarge) return undefined;
    const t = transformWorkflowToGraph(workflow);
    const shrink = <N extends { style: { width: number; height: number } }>(n: N): N =>
      isNonBypassNode(n.style) ? { ...n, style: { width: nodeWidth, height: nodeHeight } } : n;
    return {
      ...t,
      nodes: t.nodes.map(shrink),
      foreachGroups: t.foreachGroups.map((g) => ({
        ...g,
        innerNodes: g.innerNodes.map(shrink),
      })),
    };
  }, [workflow, nodeWidth, nodeHeight, tooLarge]);

  return (
    <div style={{ width, height }} data-test-subj="workflowGraphPreview">
      {tooLarge ? (
        <div
          css={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
          data-test-subj="workflowGraphPreviewTooLarge"
        >
          <EuiIcon type="graphApp" size="xl" aria-hidden={true} />
          <EuiText size="s" color="subdued" textAlign="center">
            {i18n.translate('workflowsUi.graphPreview.tooLarge', {
              defaultMessage: 'Workflow is too large to preview',
            })}
          </EuiText>
        </div>
      ) : (
        <ReactFlowProvider>
          <WorkflowGraphCanvasWithoutProvider
            workflow={workflow}
            transformed={transformed}
            isYamlValid
            onStepSelect={noop}
            renderStepIcon={renderStepIcon}
            direction={direction}
            rankSep={rankSep}
            nodeSep={nodeSep}
            showBackground
            previewMode
          />
        </ReactFlowProvider>
      )}
    </div>
  );
}
