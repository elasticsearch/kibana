/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IconType } from '@elastic/eui';
import { EuiButtonIcon, EuiIcon, EuiLoadingSpinner, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import React, { memo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { WorkflowStepExecutionDto } from '@kbn/workflows';
import { ExecutionStatus, TRIGGER_STEP_TYPES } from '@kbn/workflows';
import { deslugifyStepName } from './deslugify_step_name';
import { useWorkflowGraphActions } from './workflow_graph_actions_context';
import type { RenderStepIcon } from './workflow_graph_actions_context';
import { getStepIconType, getTriggerTypeIconType } from '../step_icons';

export interface WorkflowGraphNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly stepType: string;
  readonly isTrigger?: boolean;
  readonly stepExecution?: WorkflowStepExecutionDto;
  /** Icon-only compact render (workflow-list popover). */
  readonly preview?: boolean;
  /**
   * Raw step definition attached by `transformWorkflowToGraph`. Read by the
   * node to surface configuration the row UI cares about (e.g. retry-on-failure
   * `max-attempts` for the badge) without having to thread the workflow YAML
   * down a second time.
   */
  readonly step?: {
    readonly retry?: { readonly 'max-attempts'?: number };
    readonly 'on-failure'?: { readonly retry?: { readonly 'max-attempts'?: number } };
  };
}

/**
 * Extract the configured `retry.max-attempts` for a step, looking at both
 * the step-level `retry` shortcut and the canonical `on-failure.retry` block.
 * Returns `undefined` when retry isn't configured.
 */
function getStepMaxAttempts(step: WorkflowGraphNodeData['step']): number | undefined {
  const fromDirect = step?.retry?.['max-attempts'];
  const fromOnFailure = step?.['on-failure']?.retry?.['max-attempts'];
  const value = fromDirect ?? fromOnFailure;
  return typeof value === 'number' && value > 0 ? value : undefined;
}

// Branded multi-color icons keep their natural palette; everything else is
// tinted with the trigger/step accent color.
const LOGO_ICONS = new Set<IconType>(['logoElasticsearch', 'logoKibana']);

interface NodePalette {
  readonly outerBorder: string;
  readonly iconAreaBg: string;
  readonly innerBoxBorder: string;
  readonly iconColor: string;
  readonly selectedBorder: string;
}

type EuiTheme = ReturnType<typeof useEuiTheme>['euiTheme'];

// ----------- Pure color/state helpers -----------

interface ExecutionState {
  readonly isRunning: boolean;
  readonly isSuccess: boolean;
  readonly isFailed: boolean;
}

function resolveExecutionState(execStatus: ExecutionStatus | undefined): ExecutionState {
  const isRunning =
    execStatus === ExecutionStatus.RUNNING ||
    execStatus === ExecutionStatus.WAITING ||
    execStatus === ExecutionStatus.WAITING_FOR_INPUT ||
    execStatus === ExecutionStatus.PENDING;
  const isSuccess = execStatus === ExecutionStatus.COMPLETED;
  const isFailed =
    execStatus === ExecutionStatus.FAILED ||
    execStatus === ExecutionStatus.TIMED_OUT ||
    execStatus === ExecutionStatus.CANCELLED;
  return { isRunning, isSuccess, isFailed };
}

function pickByExecStatus(
  isSuccess: boolean,
  isFailed: boolean,
  success: string,
  failed: string,
  idle: string
): string {
  if (isSuccess) return success;
  if (isFailed) return failed;
  return idle;
}

function resolveBorderColor(
  { isRunning, isSuccess, isFailed }: ExecutionState,
  isActive: boolean,
  options: { running: string; success: string; fail: string; selected: string; idle: string }
): string {
  if (isRunning) return options.running;
  if (!isActive) return options.idle;
  if (isFailed) return options.fail;
  if (isSuccess) return options.success;
  return options.selected;
}

interface NodeColors {
  readonly palette: NodePalette;
  readonly triggerIconColor: string;
  readonly stepLabelColor: string;
  readonly borderColor: string;
  readonly iconAreaBg: string;
  readonly innerBoxBorder: string;
  readonly iconColor: string;
  readonly forceTriggerPinkFill: boolean;
  readonly retryBadgeBg: string;
  readonly retryBadgeColor: string;
  readonly statusSuccessColor: string;
  readonly statusFailColor: string;
  readonly borderRadius: number;
  readonly hasStatusIcon: boolean;
}

export function resolveNodeColors(
  euiTheme: EuiTheme,
  isTriggerNode: boolean,
  { isRunning, isSuccess, isFailed }: ExecutionState,
  isActive: boolean
): NodeColors {
  const { colors } = euiTheme;

  // Step palette tokens
  const stepOuterBorder = colors.backgroundLightPrimary;
  const stepIconAreaBg = colors.backgroundLightPrimary;
  const stepInnerBoxBorder = colors.borderBaseSubdued;
  const stepIconColor = colors.primary;
  const stepSelectedBorder = colors.primary;

  // Trigger palette tokens
  const triggerOuterBorder = colors.backgroundLightAccent;
  const triggerIconAreaBg = colors.backgroundBaseAccent;
  const triggerInnerBoxBorder = colors.borderBaseAccent;
  const triggerIconColor = colors.accent;
  const triggerSelectedBorder = colors.accent;

  // Execution status tokens
  const statusRunningBorder = colors.primary;
  const statusSuccessBg = colors.backgroundBaseSuccess;
  const statusSuccessColor = colors.success;
  const statusFailColor = colors.danger;

  const palette: NodePalette = isTriggerNode
    ? {
        outerBorder: triggerOuterBorder,
        iconAreaBg: triggerIconAreaBg,
        innerBoxBorder: triggerInnerBoxBorder,
        iconColor: triggerIconColor,
        selectedBorder: triggerSelectedBorder,
      }
    : {
        outerBorder: stepOuterBorder,
        iconAreaBg: stepIconAreaBg,
        innerBoxBorder: stepInnerBoxBorder,
        iconColor: stepIconColor,
        selectedBorder: stepSelectedBorder,
      };

  // Running always shows the in-progress ring. Active nodes take the status
  // colour after execution; idle nodes show the family tint.
  const borderColor = resolveBorderColor({ isRunning, isSuccess, isFailed }, isActive, {
    running: statusRunningBorder,
    success: statusSuccessColor,
    fail: statusFailColor,
    selected: palette.selectedBorder,
    idle: palette.outerBorder,
  });

  const iconAreaBg = pickByExecStatus(
    isSuccess,
    isFailed,
    statusSuccessBg,
    colors.backgroundBaseDanger,
    palette.iconAreaBg
  );

  // Inner box border keeps neutral while only selection is active; status
  // states recolour it.
  const innerBoxBorder = pickByExecStatus(
    isSuccess,
    isFailed,
    statusSuccessColor,
    statusFailColor,
    palette.innerBoxBorder
  );

  // Trigger icon stays pink while idle; once execution kicks off it shares
  // the same success/failed colours as regular steps.
  const iconColor = pickByExecStatus(
    isSuccess,
    isFailed,
    statusSuccessColor,
    statusFailColor,
    palette.iconColor
  );

  // Triggers in their idle pink state need a hard `fill` override because
  // EuiIcon paints `fill` directly onto the SVG paths, beating CSS `color`
  // inheritance.
  const forceTriggerPinkFill = isTriggerNode && !isSuccess && !isFailed;

  return {
    palette,
    triggerIconColor,
    stepLabelColor: colors.textHeading,
    borderColor,
    iconAreaBg,
    innerBoxBorder,
    iconColor,
    forceTriggerPinkFill,
    retryBadgeBg: colors.backgroundBaseWarning,
    retryBadgeColor: colors.textWarning,
    statusSuccessColor,
    statusFailColor,
    borderRadius: isRunning ? 8 : 10,
    hasStatusIcon: isRunning || isSuccess || isFailed,
  };
}

// ----------- Sub-components -----------

// Renders the step or trigger icon — custom renderStepIcon or EuiIcon fallback.
function NodeStepIcon({
  iconType,
  iconColor,
  forceTriggerPinkFill,
  triggerIconColor,
  renderStepIcon,
  stepType,
  isTrigger,
}: {
  iconType: ReturnType<typeof getStepIconType>;
  iconColor: string;
  forceTriggerPinkFill: boolean;
  triggerIconColor: string;
  renderStepIcon?: RenderStepIcon;
  stepType: string;
  isTrigger: boolean;
}) {
  if (renderStepIcon) {
    return (
      <div
        css={[
          { color: iconColor, display: 'flex' },
          forceTriggerPinkFill && { '& svg, & svg *': { fill: triggerIconColor } },
        ]}
      >
        {renderStepIcon({ stepType, isTrigger, size: 'm', color: iconColor })}
      </div>
    );
  }
  return (
    <EuiIcon
      type={iconType}
      size="m"
      color={LOGO_ICONS.has(String(iconType)) ? undefined : iconColor}
      aria-hidden={true}
    />
  );
}

// Dense preview card — icon, step name and step-type subtitle. Used by the
// inline attachment preview and the workflow-list hover popover.
function NodePreviewCard({
  stepType,
  label,
  isTrigger,
  isTriggerNode,
  iconType,
  palette,
  stepLabelColor,
  triggerIconColor,
  renderStepIcon,
  targetHandlePos,
  sourceHandlePos,
}: {
  stepType: string;
  label: string;
  isTrigger?: boolean;
  isTriggerNode: boolean;
  iconType: ReturnType<typeof getStepIconType>;
  palette: NodePalette;
  stepLabelColor: string;
  triggerIconColor: string;
  renderStepIcon?: RenderStepIcon;
  targetHandlePos: Position;
  sourceHandlePos: Position;
}) {
  const { euiTheme } = useEuiTheme();
  return (
    <>
      {!isTrigger && <Handle type="target" position={targetHandlePos} style={{ opacity: 0 }} />}
      <div
        aria-label={`${stepType}: ${label}`}
        css={{
          width: '100%',
          height: '100%',
          background: euiTheme.colors.backgroundBasePlain,
          border: `1px solid ${palette.outerBorder}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 8,
          overflow: 'hidden',
        }}
      >
        <div
          css={{
            flex: '0 0 auto',
            width: 32,
            height: 32,
            background: palette.iconAreaBg,
            border: `1px solid ${palette.innerBoxBorder}`,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <NodeStepIcon
            iconType={iconType}
            iconColor={palette.iconColor}
            forceTriggerPinkFill={isTriggerNode}
            triggerIconColor={triggerIconColor}
            renderStepIcon={renderStepIcon}
            stepType={stepType}
            isTrigger={isTrigger ?? false}
          />
        </div>
        <div
          css={{
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <span
            css={{
              fontFamily: euiTheme.font.family,
              fontSize: 12,
              fontWeight: 500,
              lineHeight: '16px',
              color: stepLabelColor,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={label}
          >
            {label}
          </span>
          <span
            css={{
              fontFamily: euiTheme.font.familyCode ?? euiTheme.font.family,
              fontSize: 11,
              lineHeight: '14px',
              color: euiTheme.colors.textSubdued,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={stepType}
          >
            {stepType}
          </span>
        </div>
      </div>
      <Handle type="source" position={sourceHandlePos} style={{ opacity: 0 }} />
    </>
  );
}

// Warning badge showing the retry-on-failure max-attempts count.
function NodeRetryBadge({
  maxAttempts,
  bgColor,
  textColor,
  fontFamily,
}: {
  maxAttempts: number;
  bgColor: string;
  textColor: string;
  fontFamily: string;
}) {
  return (
    <EuiToolTip
      content={i18n.translate('workflowsUi.graphNode.retryBadgeTooltip', {
        defaultMessage:
          'Retries on failure up to {count, plural, one {# attempt} other {# attempts}}',
        values: { count: maxAttempts },
      })}
      disableScreenReaderOutput
    >
      <div
        tabIndex={0}
        data-test-subj="workflowGraphNodeRetryBadge"
        aria-label={i18n.translate('workflowsUi.graphNode.retryBadgeAria', {
          defaultMessage: '{count, plural, one {# retry} other {# retries}} on failure',
          values: { count: maxAttempts },
        })}
        css={{
          flex: '0 0 auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          borderRadius: 999,
          background: bgColor,
          color: textColor,
          fontFamily,
          fontSize: 12,
          fontWeight: 400,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <EuiIcon type="refresh" size="s" color={textColor} aria-hidden />
        <span>{maxAttempts}</span>
      </div>
    </EuiToolTip>
  );
}

// Execution-status indicator: spinner (running), check (success), or error (failed).
function NodeStatusIcon({
  isRunning,
  isSuccess,
  successColor,
  failColor,
}: {
  isRunning: boolean;
  isSuccess: boolean;
  successColor: string;
  failColor: string;
}) {
  return (
    <div
      css={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
      }}
      aria-label={
        isRunning
          ? i18n.translate('workflowsUi.graphNode.statusRunning', { defaultMessage: 'Running' })
          : isSuccess
          ? i18n.translate('workflowsUi.graphNode.statusSuccess', {
              defaultMessage: 'Completed successfully',
            })
          : i18n.translate('workflowsUi.graphNode.statusFailed', { defaultMessage: 'Failed' })
      }
    >
      {isRunning ? (
        <EuiLoadingSpinner size="m" />
      ) : isSuccess ? (
        <EuiIcon type="checkCircleFill" color={successColor} size="m" aria-hidden={true} />
      ) : (
        <EuiIcon type="errorFill" color={failColor} size="m" aria-hidden={true} />
      )}
    </div>
  );
}

// Hover-action strip containing the run-step button.
function NodeRunActions({
  onStepRun,
  canRunSteps,
  label,
}: {
  onStepRun?: (label: string) => void;
  canRunSteps?: boolean;
  label: string;
}) {
  const runLabel = i18n.translate('workflowsUi.graphNode.runStep', { defaultMessage: 'Run step' });
  return (
    <div
      css={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}
      // Stop clicks/mousedowns on the icons from bubbling to the node
      // selection / pane handlers in React Flow.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <EuiToolTip content={runLabel} disableScreenReaderOutput>
        <EuiButtonIcon
          iconType="play"
          size="s"
          color="success"
          aria-label={runLabel}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onStepRun?.(label);
          }}
          isDisabled={!onStepRun || canRunSteps === false}
          data-test-subj="workflowGraphNodeRunStep"
        />
      </EuiToolTip>
    </div>
  );
}

// ----------- Main node component -----------

function WorkflowGraphNodeInner(node: NodeProps<Node<WorkflowGraphNodeData>>) {
  const { stepType, label, isTrigger, stepExecution, preview, step } = node.data;
  const { euiTheme } = useEuiTheme();
  const isTriggerNode = isTrigger || TRIGGER_STEP_TYPES.has(stepType);
  // Display-only: trigger labels are already human-readable (getTriggerLabel);
  // step labels are frequently authored as slugs, so deslugify for display.
  // `label` itself must stay untouched — it's used to key execution status.
  const displayLabel = isTriggerNode ? label : deslugifyStepName(label);

  const iconType = isTriggerNode ? getTriggerTypeIconType(stepType) : getStepIconType(stepType);
  const maxAttempts = getStepMaxAttempts(step);
  const targetHandlePos = node.targetPosition ?? Position.Top;
  const sourceHandlePos = node.sourcePosition ?? Position.Bottom;

  const isActive = node.selected;
  const [isHovered, setIsHovered] = useState(false);
  const { onStepRun, canRunSteps, renderStepIcon, onStepSelect } = useWorkflowGraphActions();

  const execState = resolveExecutionState(stepExecution?.status);
  const colors = resolveNodeColors(euiTheme, isTriggerNode, execState, isActive ?? false);

  const showActions =
    Boolean(canRunSteps && onStepRun) &&
    (isHovered || isActive) &&
    !isTrigger &&
    !colors.hasStatusIcon;

  // Dense preview render for inline attachment previews: icon + step name +
  // step-type subtitle. No interaction, no retry badge, no run button. All
  // hooks above are still called every render, so the early return is safe.
  if (preview) {
    return (
      <NodePreviewCard
        stepType={stepType}
        label={displayLabel}
        isTrigger={isTrigger}
        isTriggerNode={isTriggerNode}
        iconType={iconType}
        palette={colors.palette}
        stepLabelColor={colors.stepLabelColor}
        triggerIconColor={colors.triggerIconColor}
        renderStepIcon={renderStepIcon}
        targetHandlePos={targetHandlePos}
        sourceHandlePos={sourceHandlePos}
      />
    );
  }

  return (
    <>
      {!isTrigger && <Handle type="target" position={targetHandlePos} style={{ opacity: 0 }} />}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${stepType} step: ${displayLabel}${
          stepExecution?.status ? `, status: ${stepExecution.status}` : ''
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onStepSelect?.(node.id);
          }
        }}
        css={[
          {
            position: 'relative',
            width: '100%',
            height: '100%',
            background: euiTheme.colors.backgroundBasePlain,
            // Flat card: a 1px border tinted to the node's
            // family (light blue for steps, light pink for triggers) via
            // `palette.outerBorder`. Active/running/status states recolor it.
            border: `1px solid ${colors.borderColor}`,
            borderRadius: colors.borderRadius,
            // Clip children to the card's rounded shape so the icon pane's
            // corners stay concentric with the card border (otherwise the pane
            // and card render two slightly different corner arcs).
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            // 16px gutter on the right whenever any meta is present (retry badge,
            // status icon, or hover action) so the retry badge sits at the
            // design's 16px inset from the step's right edge.
            paddingRight: 16,
            transition: 'border-color 120ms ease, background 120ms ease',
          },
        ]}
      >
        {/* Icon area — colored background pane. No own corner radius: the card's
            `overflow: hidden` clips it to the rounded shape, so the pane fills
            flush into the corner with no gap. */}
        <div
          css={{
            flex: '0 0 auto',
            height: '100%',
            background: colors.iconAreaBg,
            display: 'flex',
            alignItems: 'center',
            padding: 12,
            transition: 'background 120ms ease',
          }}
        >
          <div
            css={{
              width: 40,
              height: 40,
              background: euiTheme.colors.backgroundBasePlain,
              border: `1px solid ${colors.innerBoxBorder}`,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'border-color 120ms ease',
            }}
          >
            <NodeStepIcon
              iconType={iconType}
              iconColor={colors.iconColor}
              forceTriggerPinkFill={colors.forceTriggerPinkFill}
              triggerIconColor={colors.triggerIconColor}
              renderStepIcon={renderStepIcon}
              stepType={stepType}
              isTrigger={isTrigger ?? false}
            />
          </div>
        </div>

        <span
          css={{
            flex: '1 1 auto',
            fontFamily: euiTheme.font.family,
            fontSize: 12,
            fontStyle: 'normal',
            fontWeight: 500,
            lineHeight: '24px',
            color: colors.stepLabelColor,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
          title={displayLabel}
        >
          {displayLabel}
        </span>

        {/* Retry-on-failure badge: the configured max-attempts taken from
            either `step.retry` or `step['on-failure'].retry`. Mirrors the
            badge in the execution detail step list. */}
        {maxAttempts != null && (
          <NodeRetryBadge
            maxAttempts={maxAttempts}
            bgColor={colors.retryBadgeBg}
            textColor={colors.retryBadgeColor}
            fontFamily={euiTheme.font.family}
          />
        )}

        {colors.hasStatusIcon && (
          <NodeStatusIcon
            isRunning={execState.isRunning}
            isSuccess={execState.isSuccess}
            successColor={colors.statusSuccessColor}
            failColor={colors.statusFailColor}
          />
        )}

        {showActions && (
          <NodeRunActions onStepRun={onStepRun} canRunSteps={canRunSteps} label={label} />
        )}
      </div>
      <Handle type="source" position={sourceHandlePos} style={{ opacity: 0 }} />
    </>
  );
}

/**
 * Field-level equality comparator so that a live-execution status poll that
 * mints a fresh `data` object identity only re-renders nodes whose status
 * actually changed — not every node in the graph on every poll.
 *
 * Mirrors the pattern used by `edgePropsAreEqual` in workflow_graph_edge.tsx.
 */
function nodePropsAreEqual(
  prev: NodeProps<Node<WorkflowGraphNodeData>>,
  next: NodeProps<Node<WorkflowGraphNodeData>>
): boolean {
  return (
    prev.data.label === next.data.label &&
    prev.data.stepType === next.data.stepType &&
    prev.data.isTrigger === next.data.isTrigger &&
    prev.data.stepExecution?.status === next.data.stepExecution?.status &&
    prev.data.preview === next.data.preview &&
    prev.data.step === next.data.step &&
    prev.selected === next.selected &&
    prev.targetPosition === next.targetPosition &&
    prev.sourcePosition === next.sourcePosition &&
    prev.positionAbsoluteX === next.positionAbsoluteX &&
    prev.positionAbsoluteY === next.positionAbsoluteY
  );
}

export const WorkflowGraphNode = memo(WorkflowGraphNodeInner, nodePropsAreEqual);
