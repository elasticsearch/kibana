/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { UseEuiTheme } from '@elastic/eui';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import type { ViewMode } from '@kbn/presentation-publishing';
import type { Observable } from 'rxjs';
import { css } from '@emotion/react';
import { TimeSliderStrings } from './time_slider_strings';

interface Props {
  onPlay: () => void;
  onPause: () => void;
  waitForControlOutputConsumersToLoad$?: Observable<void>;
  viewMode: ViewMode;
  disablePlayButton: boolean;
  isPaused: boolean;
}

export function PlayButton(props: Props) {
  if (
    props.waitForControlOutputConsumersToLoad$ === undefined ||
    (props.disablePlayButton && props.viewMode === 'view')
  ) {
    return null;
  }

  const Button = (
    <EuiToolTip
      content={TimeSliderStrings.control.getPlayButtonAriaLabel(props.isPaused)}
      disableScreenReaderOutput
    >
      <EuiButtonIcon
        onClick={props.isPaused ? props.onPlay : props.onPause}
        disabled={props.disablePlayButton}
        iconType={props.isPaused ? 'play' : 'pause'}
        size="s"
        display="fill"
        aria-label={TimeSliderStrings.control.getPlayButtonAriaLabel(props.isPaused)}
        css={styles.icon}
      />
    </EuiToolTip>
  );
  return props.disablePlayButton ? (
    <EuiToolTip display="block" content={TimeSliderStrings.control.getPlayButtonDisabledTooltip()}>
      {Button}
    </EuiToolTip>
  ) : (
    Button
  );
}

const styles = {
  icon: ({ euiTheme }: UseEuiTheme) => css`
    height: 100%;
    &:enabled {
      background-color: ${euiTheme.colors.primary} !important;
    }
  `,
};
