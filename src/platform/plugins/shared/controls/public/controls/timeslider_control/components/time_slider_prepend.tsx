/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButtonIcon, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import type { ViewMode } from '@kbn/presentation-publishing';
import type { FC } from 'react';
import React, { useCallback, useState } from 'react';
import type { Observable, Subscription } from 'rxjs';
import { first } from 'rxjs';
import { PlayButton } from './play_button';
import { TimeSliderStrings } from './time_slider_strings';

interface Props {
  onNext: () => void;
  onPrevious: () => void;
  waitForControlOutputConsumersToLoad$?: Observable<void>;
  viewMode: ViewMode;
  disablePlayButton: boolean;
  setIsPopoverOpen: (isPopoverOpen: boolean) => void;
}

export const TimeSliderPrepend: FC<Props> = (props: Props) => {
  const [isPaused, setIsPaused] = useState(true);
  const [timeoutId, setTimeoutId] = useState<number | undefined>(undefined);
  const [subscription, setSubscription] = useState<Subscription | undefined>(undefined);

  const playNextFrame = useCallback(() => {
    // advance to next frame
    props.onNext();

    if (props.waitForControlOutputConsumersToLoad$) {
      const nextFrameSubscription = props.waitForControlOutputConsumersToLoad$
        .pipe(first())
        .subscribe(() => {
          // use timeout to display frame for small time period before moving to next frame
          const nextTimeoutId = window.setTimeout(() => {
            playNextFrame();
          }, 1750);
          setTimeoutId(nextTimeoutId);
        });
      setSubscription(nextFrameSubscription);
    }
  }, [props]);

  const onPlay = useCallback(() => {
    props.setIsPopoverOpen(true);
    setIsPaused(false);
    playNextFrame();
  }, [props, playNextFrame]);

  const onPause = useCallback(() => {
    props.setIsPopoverOpen(true);
    setIsPaused(true);
    if (subscription) {
      subscription.unsubscribe();
      setSubscription(undefined);
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(undefined);
    }
  }, [props, subscription, timeoutId]);

  return (
    <>
      <EuiFlexItem grow={false}>
        <EuiToolTip
          content={TimeSliderStrings.control.getPreviousButtonAriaLabel()}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            onClick={() => {
              onPause();
              props.onPrevious();
            }}
            iconType="chevronLimitLeft"
            color="text"
            aria-label={TimeSliderStrings.control.getPreviousButtonAriaLabel()}
            data-test-subj="timeSlider-previousTimeWindow"
          />
        </EuiToolTip>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <PlayButton
          onPlay={onPlay}
          onPause={onPause}
          waitForControlOutputConsumersToLoad$={props.waitForControlOutputConsumersToLoad$}
          viewMode={props.viewMode}
          disablePlayButton={props.disablePlayButton}
          isPaused={isPaused}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiToolTip
          content={TimeSliderStrings.control.getNextButtonAriaLabel()}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            onClick={() => {
              onPause();
              props.onNext();
            }}
            iconType="chevronLimitRight"
            color="text"
            aria-label={TimeSliderStrings.control.getNextButtonAriaLabel()}
            data-test-subj="timeSlider-nextTimeWindow"
          />
        </EuiToolTip>
      </EuiFlexItem>
    </>
  );
};
