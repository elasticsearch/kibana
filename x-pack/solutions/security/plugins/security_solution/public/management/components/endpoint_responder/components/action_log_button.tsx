/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useRef, useState } from 'react';
import {
  EuiButton,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiTitle,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EndpointResponderExtensionComponentProps } from '../types';
import { ResponseActionsLog } from '../../endpoint_response_actions_list/response_actions_log';
import { UX_MESSAGES } from '../../endpoint_response_actions_list/translations';

export const ActionLogButton = memo<EndpointResponderExtensionComponentProps>((props) => {
  const { euiTheme } = useEuiTheme();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [showActionLogFlyout, setShowActionLogFlyout] = useState<boolean>(false);
  const toggleActionLog = useCallback(() => {
    setShowActionLogFlyout((prevState) => {
      // When closing, restore focus to the trigger button so EUI's focus trap
      // doesn't return focus to <body> (which surfaces the global SkipLink).
      if (prevState) {
        window.requestAnimationFrame(() => buttonRef.current?.focus());
      }
      return !prevState;
    });
  }, []);

  const responderActionLogFlyoutTitleId = useGeneratedHtmlId({
    prefix: 'responderActionLogFlyoutTitle',
  });

  // This flyout is opened from within the console `PageOverlay` (which sits at `levels.flyout + 500`),
  // so it must be raised above the overlay to remain visible. The `+ 503` keeps both the flyout panel
  // and its mask (`flyoutZIndex - 2`) above the overlay so the overlay is dimmed behind the flyout.
  const flyoutZIndex = (euiTheme.levels.flyout as number) + 503;

  return (
    <>
      <EuiButton
        buttonRef={buttonRef}
        onClick={toggleActionLog}
        disabled={showActionLogFlyout}
        iconType="listBullet"
        data-test-subj="responderShowActionLogButton"
      >
        <FormattedMessage
          id="xpack.securitySolution.responseActionsHistoryButton.label"
          defaultMessage="Response actions history"
        />
      </EuiButton>
      {showActionLogFlyout && (
        <EuiFlyout
          onClose={toggleActionLog}
          size="m"
          paddingSize="l"
          aria-labelledby={responderActionLogFlyoutTitleId}
          data-test-subj="responderActionLogFlyout"
          session="never"
          css={css`
            z-index: ${flyoutZIndex} !important;
          `}
          maskProps={{ style: `z-index: ${flyoutZIndex - 2} !important` }}
        >
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h1 id={responderActionLogFlyoutTitleId}>
                {UX_MESSAGES.flyoutTitle(props.meta.hostName)}
              </h1>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <ResponseActionsLog agentIds={props.meta.agentId} />
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
});
ActionLogButton.displayName = 'ActionLogButton';
