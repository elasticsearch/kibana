/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import { times } from 'lodash';
import {
  EuiButtonEmpty,
  EuiDescriptionList,
  EuiContextMenuPanel,
  EuiContextMenuItem,
  EuiPopover,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useStepDetailPage } from './hooks/use_step_detail_page';

interface Props {
  stepIndex: number;
  totalSteps: number;
  handleStepHref: (no: number) => string;
}

export const StepNav = ({ stepIndex, totalSteps, handleStepHref }: Props) => {
  const [isPopoverOpen, setPopover] = useState(false);

  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
  };

  const closePopover = () => {
    setPopover(false);
  };

  const hasMoreThanOneStep = totalSteps > 1;

  const button = (
    <EuiButtonEmpty
      data-test-subj="syntheticsStepNavStepStepIndexOfTotalStepsButton"
      size="s"
      flush="left"
      iconType={hasMoreThanOneStep ? 'chevronSingleDown' : undefined}
      iconSide="right"
      onClick={onButtonClick}
      style={{ height: 20 }}
      disabled={!hasMoreThanOneStep}
    >
      <FormattedMessage
        id="xpack.synthetics.synthetics.stepDetail.totalSteps"
        defaultMessage="Step {stepIndex} of {totalSteps}"
        values={{
          stepIndex,
          totalSteps,
        }}
      />
    </EuiButtonEmpty>
  );

  const items = times(totalSteps).map((num) => (
    <EuiContextMenuItem key={num} href={handleStepHref(num + 1)} onClick={closePopover}>
      <FormattedMessage
        id="xpack.synthetics.synthetics.stepDetail.stepNumber"
        defaultMessage="Step {stepIndex}"
        values={{
          stepIndex: num + 1,
        }}
      />
    </EuiContextMenuItem>
  ));

  return (
    <EuiPopover
      id="stepDetailsStepNav"
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      aria-label={i18n.translate('xpack.synthetics.stepNav.popoverAriaLabel', {
        defaultMessage: 'Step navigation menu',
      })}
    >
      <EuiContextMenuPanel items={items} />
    </EuiPopover>
  );
};

export const StepDetailPageStepNav = () => {
  const { activeStep, journey, stepIndex, handleStepHref, stepEnds } = useStepDetailPage();

  if (!journey || !activeStep) return null;

  return (
    <EuiDescriptionList
      listItems={[
        {
          title: STEP_LABEL,
          description: (
            <StepNav
              stepIndex={stepIndex}
              totalSteps={stepEnds.length}
              handleStepHref={handleStepHref}
            />
          ),
        },
      ]}
    />
  );
};

export const STEP_LABEL = i18n.translate('xpack.synthetics.synthetics.stepDetail.stepLabel', {
  defaultMessage: 'Step',
});
