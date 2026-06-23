/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import { css } from '@emotion/react';
import { ActionButtonType, type ActionButton } from '@kbn/agent-builder-browser/attachments';
import { actionsContainerStyles, visualizationActionsClassName } from './styles';

export const renderActionButton = (button: ActionButton) => {
  const buttonElement = (
    <EuiToolTip content={button.label} disableScreenReaderOutput>
      <EuiButtonIcon
        display="base"
        color="text"
        size="s"
        iconType={button.icon ? button.icon : 'pencil'}
        aria-label={button.label}
        css={button.type === ActionButtonType.PRIMARY ? css({ marginLeft: '-1px' }) : undefined}
        isDisabled={button.disabled}
        onClick={button.handler}
      />
    </EuiToolTip>
  );
  const tooltipContent = button.disabled ? button.disabledReason ?? button.label : button.label;

  return (
    <EuiToolTip key={button.label} content={tooltipContent} disableScreenReaderOutput>
      {button.disabled ? <span tabIndex={0}>{buttonElement}</span> : buttonElement}
    </EuiToolTip>
  );
};

export const FallbackVisualizationActions = ({ buttons }: { buttons: ActionButton[] }) => {
  return (
    <div
      css={actionsContainerStyles}
      className={visualizationActionsClassName}
      data-test-subj="visualizationButtonActions"
    >
      {buttons.map(renderActionButton)}
    </div>
  );
};
