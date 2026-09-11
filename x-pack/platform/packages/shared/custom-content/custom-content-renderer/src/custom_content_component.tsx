/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiProgress, useEuiTheme } from '@elastic/eui';
import { KbnDangerCallout } from '@kbn/ui-callout';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { AggregateQuery, Filter, Query, TimeRange, ProjectRouting } from '@kbn/es-query';
import type { ESQLControlVariable } from '@kbn/esql-types';
import React, { useEffect, useMemo } from 'react';
import { useCustomContentHtml } from './use_custom_content_html';
import { CustomContentEmptyPrompt } from './custom_content_empty_prompt';
import { CustomContentGeneratingPrompt } from './custom_content_generating_prompt';
import type { CustomContentRendererServices } from './types';

export interface CustomContentComponentProps {
  services: CustomContentRendererServices;
  embeddableId: string;
  esqlQuery: string | undefined;
  timeRange: TimeRange | undefined;
  generationVersion: number;
  savedTemplate: string | undefined;
  isApproximate: boolean;
  projectRouting: ProjectRouting | undefined;
  query: Query | AggregateQuery | undefined;
  filters: Filter[] | undefined;
  esqlVariables: ESQLControlVariable[] | undefined;
  previewHtml: string | null;
  /** Whether the host can hand an empty panel over to the agent. Drives the empty prompt's copy. */
  isAiAvailable?: boolean;
  /** True while the agent is generating or updating this panel, to show a generating state. */
  isGenerating?: boolean;
  onLoadingChange: (isLoading: boolean) => void;
  setApproximationApplied?: (approximationApplied: boolean | undefined) => void;
  onGenerateWithChat?: () => void;
}

const iframeContainerCss = css({
  position: 'relative',
  flex: '1 1 0%',
  minHeight: 200,
});

const iframeCss = css({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  border: 'none',
  background: 'transparent',
});

const IFRAME_TITLE = i18n.translate('xpack.customContent.iframeTitle', {
  defaultMessage: 'Custom panel',
});

export const CustomContentComponent = ({
  services,
  embeddableId,
  esqlQuery,
  timeRange,
  generationVersion,
  savedTemplate,
  isApproximate,
  projectRouting,
  query,
  filters,
  esqlVariables,
  previewHtml,
  isAiAvailable = false,
  isGenerating = false,
  onLoadingChange,
  setApproximationApplied,
  onGenerateWithChat,
}: CustomContentComponentProps) => {
  const { euiTheme, colorMode } = useEuiTheme();
  const { html, isLoading, error, noContent } = useCustomContentHtml({
    services,
    embeddableId,
    esqlQuery,
    timeRange,
    generationVersion,
    savedTemplate,
    colorMode,
    euiTheme,
    isApproximate,
    projectRouting,
    query,
    filters,
    esqlVariables,
    setApproximationApplied,
  });

  useEffect(() => onLoadingChange(isLoading), [isLoading, onLoadingChange]);

  const wrapperCss = useMemo(
    () =>
      css({
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 100%',
        minHeight: 200,
        background: euiTheme.colors.emptyShade,
      }),
    [euiTheme.colors.emptyShade]
  );

  return (
    <div css={wrapperCss} data-shared-item data-test-subj="customContentPanel">
      {error && (
        <KbnDangerCallout
          title={i18n.translate('xpack.customContent.error.title', {
            defaultMessage: 'Failed to render panel',
          })}
          style={{ margin: euiTheme.size.base }}
          announceOnMount
        >
          {error}
        </KbnDangerCallout>
      )}
      {!error && !isGenerating && noContent && !isLoading && previewHtml == null && (
        <CustomContentEmptyPrompt
          isAiAvailable={isAiAvailable}
          onGenerateWithChat={onGenerateWithChat}
        />
      )}
      {previewHtml != null ? (
        <div css={iframeContainerCss}>
          <iframe css={iframeCss} srcDoc={previewHtml} sandbox="" title={IFRAME_TITLE} />
        </div>
      ) : (
        !error &&
        !noContent &&
        html && (
          <div css={iframeContainerCss}>
            <iframe css={iframeCss} srcDoc={html} sandbox="" title={IFRAME_TITLE} />
          </div>
        )
      )}
      {!error && isGenerating && <CustomContentGeneratingPrompt />}
      {isLoading && <EuiProgress size="xs" color="accent" position="absolute" />}
    </div>
  );
};
