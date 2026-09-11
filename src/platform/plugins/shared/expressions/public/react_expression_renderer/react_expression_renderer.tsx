/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useRef } from 'react';
import { EuiProgress, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { PanelLoader } from '@kbn/panel-loader';
import type { ExpressionRenderError } from '../types';
import type { ExpressionRendererParams } from './use_expression_renderer';
import { useExpressionRenderer } from './use_expression_renderer';

// Accept all options of the runner as props except for the
// dom element which is provided by the component itself
export interface ReactExpressionRendererProps
  extends Omit<ExpressionRendererParams, 'hasCustomErrorRenderer'> {
  className?: string;
  dataAttrs?: string[];
  renderError?: (
    message?: string | null,
    error?: ExpressionRenderError | null
  ) => React.ReactElement | React.ReactElement[];
  padding?: 'xs' | 's' | 'm' | 'l' | 'xl';
  paddingTop?: boolean;
}

export type ReactExpressionRendererType = React.ComponentType<ReactExpressionRendererProps>;
export type ExpressionRendererComponent = React.FC<ReactExpressionRendererProps>;

export function ReactExpressionRenderer({
  className,
  dataAttrs,
  padding,
  paddingTop = true,
  renderError,
  abortController,
  ...expressionRendererOptions
}: ReactExpressionRendererProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const { euiTheme } = useEuiTheme();
  const { error, isEmpty, isLoading } = useExpressionRenderer(nodeRef, {
    ...expressionRendererOptions,
    abortController,
    hasCustomErrorRenderer: !!renderError,
  });

  return (
    <div {...dataAttrs} className={className} css={styles}>
      {isEmpty && <PanelLoader />}
      {isLoading && (
        <EuiProgress size="xs" color="accent" position="absolute" css={{ zIndex: 1 }} />
      )}
      {!isLoading && error && renderError?.(error.message, error)}
      <div
        className="expExpressionRenderer__expression"
        css={css({
          width: '100%',
          height: '100%',
          ...(padding ? { padding: euiTheme.size[padding] } : {}),
          ...(!paddingTop ? { paddingTop: 0 } : {}),
          ...(isEmpty || !!error ? { display: 'none' } : {}),
        })}
        ref={nodeRef}
      />
    </div>
  );
}

const styles = css({
  position: 'relative',
  display: 'flex',
  width: '100%',
  height: '100%',
  alignItems: 'center',
  justifyContent: 'center',
});
