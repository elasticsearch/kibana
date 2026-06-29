/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiPanel, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { useSelector } from '@xstate/react';
import React, { useEffect, useRef } from 'react';
import { useFirstMountState } from 'react-use/lib/useFirstMountState';
import type { ProcessorMetrics } from '../../../state_management/simulation_state_machine';
import { isRootStep, isStepUnderEdit } from '../../../state_management/steps_state_machine';
import {
  useSimulatorSelector,
  useStreamEnrichmentSelector,
} from '../../../state_management/stream_enrichment_state_machine';
import { selectStreamType } from '../../../state_management/stream_enrichment_state_machine/selectors';
import { getStepPanelColour } from '../../../utils';
import type { StepConfigurationProps } from '../../steps_list';
import { ActionBlockEditor } from './editor';
import { ActionBlockListItem } from './list_item';

export type ActionBlockProps = StepConfigurationProps & {
  processorMetrics?: ProcessorMetrics;
};
export function ActionBlock(props: StepConfigurationProps) {
  const { stepRef, level, readOnly } = props;
  const { euiTheme } = useEuiTheme();
  const isUnderEdit = useSelector(stepRef, (snapshot) => isStepUnderEdit(snapshot));
  const isRootStepValue = useSelector(stepRef, (snapshot) => isRootStep(snapshot));

  const simulation = useSimulatorSelector((snapshot) => snapshot.context.simulation);

  const streamType = useStreamEnrichmentSelector((snapshot) => selectStreamType(snapshot.context));

  const panelColour = getStepPanelColour(level);

  const processorMetrics = simulation?.processors_metrics[stepRef.id];

  const isFirstMount = useFirstMountState();
  const freshBlockRef = useRef<HTMLDivElement>(null);
  const isClickable = !isUnderEdit && !readOnly;

  const handleEdit = () => stepRef.send({ type: 'step.edit' });

  useEffect(() => {
    if (isFirstMount && isUnderEdit && freshBlockRef.current) {
      freshBlockRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    }
  }, [isFirstMount, isUnderEdit]);

  return (
    <EuiPanel
      data-test-subj="streamsAppProcessorBlock"
      data-stream-type={streamType}
      hasShadow={false}
      color={isUnderEdit && isRootStepValue ? undefined : panelColour}
      css={
        isUnderEdit
          ? css`
              border: 1px solid ${euiTheme.colors.borderStrongPrimary};
              box-sizing: border-box;
              padding: ${euiTheme.size.m};
            `
          : css`
              border: ${euiTheme.border.thin};
              border-radius: ${euiTheme.size.s};
              padding: ${euiTheme.size.m};
            `
      }
      aria-label={
        isClickable
          ? i18n.translate(
              'xpack.streams.streamDetailView.managementTab.enrichment.processor.editProcessorAriaLabel',
              {
                defaultMessage: 'Edit processor',
              }
            )
          : undefined
      }
      onClick={isClickable ? handleEdit : undefined}
    >
      {isUnderEdit ? (
        <ActionBlockEditor {...props} ref={freshBlockRef} processorMetrics={processorMetrics} />
      ) : (
        <ActionBlockListItem {...props} processorMetrics={processorMetrics} />
      )}
    </EuiPanel>
  );
}
