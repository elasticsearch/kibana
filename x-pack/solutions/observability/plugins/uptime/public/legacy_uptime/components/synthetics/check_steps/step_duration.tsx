/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MouseEvent } from 'react';

import * as React from 'react';
import { EuiButtonEmpty, EuiPopover, EuiText } from '@elastic/eui';
import { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { JourneyStep } from '../../../../../common/runtime_types';
import { StepFieldTrend } from './step_field_trend';
import { microToSec } from '../../../lib/formatting';

interface Props {
  showStepDurationTrend?: boolean;
  compactView?: boolean;
  step: JourneyStep;
  durationPopoverOpenIndex: number | null;
  setDurationPopoverOpenIndex: (val: number | null) => void;
}

export const StepDuration = ({
  step,
  durationPopoverOpenIndex,
  setDurationPopoverOpenIndex,
  showStepDurationTrend = true,
  compactView = false,
}: Props) => {
  const stepDurationText = useMemo(
    () =>
      i18n.translate('xpack.uptime.synthetics.step.duration', {
        defaultMessage: '{value} seconds',
        values: {
          value: microToSec(step.synthetics.step?.duration.us!, 1),
        },
      }),
    [step.synthetics.step?.duration.us]
  );

  const component = useMemo(
    () => (
      <StepFieldTrend
        step={step}
        field={'synthetics.step.duration.us'}
        title={STEP_DURATION_TREND}
      />
    ),
    [step]
  );

  if (step.synthetics.step?.status === 'skipped') {
    return <span>--</span>;
  }

  if (!showStepDurationTrend) {
    return <EuiText>{stepDurationText}</EuiText>;
  }

  const button = (
    <EuiButtonEmpty
      data-test-subj="syntheticsStepDurationButton"
      onMouseEnter={() => setDurationPopoverOpenIndex(step.synthetics.step?.index ?? null)}
      iconType={compactView ? undefined : 'chartArea'}
    >
      {stepDurationText}
    </EuiButtonEmpty>
  );

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.uptime.stepDuration.popoverAriaLabel', {
        defaultMessage: 'Step duration trend',
      })}
      onClick={(evt: MouseEvent<HTMLDivElement>) => evt.stopPropagation()}
      isOpen={durationPopoverOpenIndex === step.synthetics.step?.index}
      button={button}
      closePopover={() => setDurationPopoverOpenIndex(null)}
      zIndex={100}
      ownFocus={false}
    >
      {component}
    </EuiPopover>
  );
};

const STEP_DURATION_TREND = i18n.translate('xpack.uptime.synthetics.step.durationTrend', {
  defaultMessage: 'Step duration trend',
});
