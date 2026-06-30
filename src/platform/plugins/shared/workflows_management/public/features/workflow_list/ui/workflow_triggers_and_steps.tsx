/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiFlexGroup, EuiFlexItem, EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { Step, WorkflowExecutionHistoryModel } from '@kbn/workflows';
import { collectAllSteps } from '@kbn/workflows';
import type { WorkflowTrigger } from '../../../../common/lib/trigger_types';
import * as commonI18n from '../../../../common/translations';
import { getWorkflowNextExecutionTime } from '../../../lib/next_execution_time';
import { getBaseConnectorType } from '../../../shared/ui/step_icons/get_base_connector_type';
import { StepIcon } from '../../../shared/ui/step_icons/step_icon';
import { useGetFormattedDateTime } from '../../../shared/ui/use_formatted_date';
import { PopoverItems } from '../../../widgets/worflows_triggers_list/popover_items';
import {
  getTriggerLabel,
  TriggerIcon,
} from '../../../widgets/worflows_triggers_list/worflows_triggers_list';
import { getStepTypeLabel } from '../../../widgets/workflows_step_types_list/workflows_step_types_list';

const ICON_SIZE = 16;
const ICON_GAP = 16; // matches gutterSize="m"
const OVERFLOW_BADGE_WIDTH = 36;
const DIVIDER_WIDTH = 1;
const MAX_VISIBLE_STEP_ICONS = 6;

const calculateVisibleStepCount = ({
  containerWidth,
  totalSteps,
  hasTriggerIcon,
  hasTriggerOverflow,
  hasDivider,
}: {
  containerWidth: number;
  totalSteps: number;
  hasTriggerIcon: boolean;
  hasTriggerOverflow: boolean;
  hasDivider: boolean;
}): number => {
  if (totalSteps === 0) return 0;
  if (containerWidth <= 0) return Math.min(totalSteps, MAX_VISIBLE_STEP_ICONS);

  // Sum of fixed-width prefix elements + the gaps that follow each one (the
  // gap separates that element from whatever comes next, including steps).
  let prefixWidth = 0;
  if (hasTriggerIcon) prefixWidth += ICON_SIZE + ICON_GAP;
  if (hasTriggerOverflow) prefixWidth += OVERFLOW_BADGE_WIDTH + ICON_GAP;
  if (hasDivider) prefixWidth += DIVIDER_WIDTH + ICON_GAP;

  const availableForSteps = containerWidth - prefixWidth;
  const cap = Math.min(totalSteps, MAX_VISIBLE_STEP_ICONS);

  // Try to fit all steps without an overflow badge.
  if (cap >= totalSteps) {
    const allFit = cap * (ICON_SIZE + ICON_GAP) - ICON_GAP;
    if (availableForSteps >= allFit) return totalSteps;
  }

  // Need an overflow badge — reserve room for it and split what's left.
  const availableForIcons = availableForSteps - OVERFLOW_BADGE_WIDTH - ICON_GAP;
  if (availableForIcons < ICON_SIZE) return Math.max(0, Math.min(1, cap));
  return Math.max(
    1,
    Math.min(Math.floor((availableForIcons + ICON_GAP) / (ICON_SIZE + ICON_GAP)), cap)
  );
};

interface Props {
  triggers: WorkflowTrigger[];
  steps: Step[];
  history: WorkflowExecutionHistoryModel[];
}

export const WorkflowTriggersAndSteps = ({ triggers, steps, history }: Props) => {
  const { euiTheme } = useEuiTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const getFormattedDateTime = useGetFormattedDateTime();

  const getNextExecution = useCallback(
    (triggerType: string) => {
      if (triggerType !== 'scheduled') {
        return undefined;
      }
      const nextExecutionTime = getWorkflowNextExecutionTime(triggers, history);
      return nextExecutionTime ? getFormattedDateTime(nextExecutionTime) : undefined;
    },
    [triggers, history, getFormattedDateTime]
  );

  const uniqueStepBaseTypes = useMemo(() => {
    const allSteps = collectAllSteps(steps);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const step of allSteps) {
      const baseType = getBaseConnectorType(step.type);
      if (!seen.has(baseType)) {
        seen.add(baseType);
        result.push(baseType);
      }
    }
    return result;
  }, [steps]);

  const hasTriggers = triggers.length > 0;
  const hasSteps = uniqueStepBaseTypes.length > 0;
  const [firstTrigger, ...restOfTriggers] = triggers;
  const triggerHasOverflow = restOfTriggers.length > 0;
  const hasDivider = hasTriggers && hasSteps;

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const width = node.getBoundingClientRect().width;
      if (width > 0) setContainerWidth(width);
    };
    const rafId = requestAnimationFrame(update);
    const observer = new ResizeObserver(() => requestAnimationFrame(update));
    observer.observe(node);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const visibleStepCount = calculateVisibleStepCount({
    containerWidth,
    totalSteps: uniqueStepBaseTypes.length,
    hasTriggerIcon: hasTriggers,
    hasTriggerOverflow: triggerHasOverflow,
    hasDivider,
  });
  const visibleSteps = uniqueStepBaseTypes.slice(0, visibleStepCount);
  const stepHasOverflow = visibleStepCount < uniqueStepBaseTypes.length;

  if (!hasTriggers && !hasSteps) {
    return null;
  }

  const dividerStyle = css`
    flex: 0 0 ${DIVIDER_WIDTH}px;
    align-self: center;
    width: ${DIVIDER_WIDTH}px;
    height: ${ICON_SIZE}px;
    background-color: ${euiTheme.colors.borderBaseSubdued};
  `;

  return (
    <div
      ref={containerRef}
      css={css`
        width: 100%;
        overflow: hidden;
      `}
    >
      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false} wrap={false}>
        {hasTriggers && (
          <EuiFlexItem grow={false}>
            <TriggerIcon
              triggerType={firstTrigger.type}
              nextExecution={getNextExecution(firstTrigger.type)}
            />
          </EuiFlexItem>
        )}
        {triggerHasOverflow && (
          <EuiFlexItem grow={false}>
            <PopoverItems
              items={triggers}
              popoverTitle={commonI18n.TRIGGERS_LIST_TITLE}
              popoverButtonTitle={`+${restOfTriggers.length}`}
              dataTestPrefix="triggers"
              renderItem={(trigger, idx) => (
                <EuiFlexGroup
                  key={`${trigger.type}-${idx}`}
                  alignItems="center"
                  gutterSize="s"
                  responsive={false}
                >
                  <EuiFlexItem grow={false}>
                    <TriggerIcon
                      triggerType={trigger.type}
                      nextExecution={getNextExecution(trigger.type)}
                      showLabelInTooltip={false}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s">{getTriggerLabel(trigger.type)}</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              )}
            />
          </EuiFlexItem>
        )}
        {hasDivider && <EuiFlexItem grow={false} css={dividerStyle} />}
        {visibleSteps.map((baseType) => (
          <EuiFlexItem grow={false} key={baseType}>
            <StepIcon
              stepType={baseType}
              executionStatus={undefined}
              size="m"
              title={getStepTypeLabel(baseType)}
            />
          </EuiFlexItem>
        ))}
        {stepHasOverflow && (
          <EuiFlexItem grow={false}>
            <PopoverItems
              items={uniqueStepBaseTypes}
              popoverTitle={i18n.translate('workflows.stepTypesList.title', {
                defaultMessage: 'Step types',
              })}
              popoverButtonTitle={`+${uniqueStepBaseTypes.length - visibleStepCount}`}
              dataTestPrefix="stepTypes"
              renderItem={(baseType, idx) => (
                <EuiFlexGroup
                  key={`${baseType}-${idx}`}
                  alignItems="center"
                  gutterSize="xs"
                  responsive={false}
                >
                  <EuiFlexItem grow={false}>
                    <StepIcon stepType={baseType} executionStatus={undefined} size="s" />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s">{getStepTypeLabel(baseType)}</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              )}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </div>
  );
};
