/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { css, keyframes } from '@emotion/react';
import React from 'react';
import { EuiButton, EuiLoadingSpinner, EuiPageTemplate, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

export type AppInitializingState = 'idle' | 'initializing' | 'available' | 'failed';

/** A plugin's most recent deferred-init failure, as surfaced to the initializing UI. */
export interface AppInitializingError {
  message: string;
}

export interface AppInitializingGateProps {
  /** Current deferred-init state. Lazy plugins get this gate automatically from `core.deferredInit`; see `@kbn/core-deferred-init-browser`. */
  status: AppInitializingState;
  /** The plugin whose deferred init this gate is waiting on. Shown in the failed-state message. */
  pluginId: string;
  /**
   * Present when `status === 'failed'`: the underlying error, from the plugin's `lazyInitialize()`
   * or from the application's own `mount()` -- see {@link AppInitializingGateProps.failureStage}.
   */
  error?: AppInitializingError;
  /** Present when `status === 'failed'`: how many consecutive attempts have failed so far. */
  attempts?: number;
  /**
   * Which step failed, when `status === 'failed'`. `initialization` (the default) means the
   * plugin's deferred init threw; `mount` means deferred init succeeded but the application's own
   * `mount()` rejected afterwards. Only the wording differs -- both offer a page reload, which is
   * the right remediation for either.
   */
  failureStage?: 'initialization' | 'mount';
  /** Invoked when the user clicks "Reload page" in the failed state. */
  onRetry?: () => void;
  children: React.ReactNode;
}

export const AppInitializingGate: React.FC<AppInitializingGateProps> = ({
  status,
  pluginId,
  error,
  attempts,
  failureStage = 'initialization',
  onRetry,
  children,
}) => {
  const { euiTheme } = useEuiTheme();

  const fadeIn = keyframes({
    '0%': { opacity: 0 },
    '50%': { opacity: 0 },
    '100%': { opacity: 1 },
  });

  // The text rises up out of the slit while fading in, holds, then sinks back
  // down into the slit while fading out before the loop repeats. The first and
  // last frames are identical (below the slit, transparent), so the loop is
  // seamless with no jump.
  const riseFromSlit = keyframes({
    '0%': { transform: 'translateY(100%)', opacity: 0 },
    '20%': { transform: 'translateY(0)', opacity: 1 },
    '65%': { transform: 'translateY(0)', opacity: 1 },
    '85%': { transform: 'translateY(-100%)', opacity: 0 },
    '100%': { transform: 'translateY(-100%)', opacity: 0 },
  });

  const loadingContainerStyles = css({
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: euiTheme.levels.header,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: euiTheme.size.s,
    fontVariant: 'all-petite-caps',
    fontSize: '1.2em',
    animationName: fadeIn,
    animationIterationCount: 1,
    animationTimingFunction: 'ease-in',
    animationDuration: '2s',
  });

  // The "slit": clips its child so the text appears to rise out of / sink into
  // a thin opening rather than simply translating on screen.
  const slitStyles = css({
    display: 'block',
    overflow: 'hidden',
  });

  const risingTextStyles = css({
    display: 'block',
    lineHeight: 1.5,
    color: euiTheme.colors.subduedText,
    willChange: 'transform, opacity',
    animationName: riseFromSlit,
    animationDuration: '2.8s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      transform: 'none',
      opacity: 1,
    },
  });

  if (status === 'available') {
    return <>{children}</>;
  }

  if (status === 'failed') {
    return (
      <EuiPageTemplate grow={false} data-test-subj="appInitializingGate-errorPage">
        <EuiPageTemplate.EmptyPrompt
          color="danger"
          iconType="warning"
          iconColor="danger"
          title={
            <h2>
              {failureStage === 'mount' ? (
                <FormattedMessage
                  id="core.application.appInitializingGate.mountErrorTitle"
                  defaultMessage='"{pluginId}" failed to load'
                  values={{ pluginId }}
                />
              ) : (
                <FormattedMessage
                  id="core.application.appInitializingGate.errorTitle"
                  defaultMessage='"{pluginId}" failed to initialize'
                  values={{ pluginId }}
                />
              )}
            </h2>
          }
          body={
            <>
              <p>
                {failureStage === 'mount' ? (
                  <FormattedMessage
                    id="core.application.appInitializingGate.mountErrorBody"
                    defaultMessage="This application finished initializing but could not be loaded."
                  />
                ) : (
                  <FormattedMessage
                    id="core.application.appInitializingGate.errorBody"
                    defaultMessage="An error occurred while initializing this application."
                  />
                )}
              </p>
              {error && (
                <p data-test-subj="appInitializingGate-errorMessage">
                  <strong>
                    <FormattedMessage
                      id="core.application.appInitializingGate.errorMessageLabel"
                      defaultMessage="Error:"
                    />
                  </strong>{' '}
                  {error.message}
                </p>
              )}
              {!!attempts && (
                <p data-test-subj="appInitializingGate-attempts">
                  <FormattedMessage
                    id="core.application.appInitializingGate.attemptsBody"
                    defaultMessage="Kibana has automatically retried {attempts, plural, one {once} other {# times}}."
                    values={{ attempts }}
                  />
                </p>
              )}
            </>
          }
          actions={
            onRetry ? (
              <EuiButton
                color="danger"
                fill
                onClick={onRetry}
                data-test-subj="appInitializingGate-reloadButton"
              >
                <FormattedMessage
                  id="core.application.appInitializingGate.retryButtonLabel"
                  defaultMessage="Reload page"
                />
              </EuiButton>
            ) : undefined
          }
        />
      </EuiPageTemplate>
    );
  }

  // 'idle' or 'initializing'
  return (
    <div css={loadingContainerStyles} data-test-subj="appInitializingGate-loadingPage">
      <EuiLoadingSpinner
        size="xxl"
        aria-label={i18n.translate('core.application.appInitializingGate.loadingAriaLabel', {
          defaultMessage: 'Initializing application',
        })}
      />
      <span css={slitStyles}>
        <span css={risingTextStyles}>
          <FormattedMessage
            id="core.application.appInitializingGate.initializingTitle"
            defaultMessage="Initializing Application"
          />
        </span>
      </span>
    </div>
  );
};
