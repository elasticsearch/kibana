/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiCallOut, EuiEmptyPrompt, EuiProgress, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React, { useMemo } from 'react';
import { useAiPanelHtml } from '../hooks/use_ai_panel_html';

interface AiPanelComponentProps {
  embeddableId: string;
  prompt: string;
  esqlQuery: string | undefined;
  timeRange: { from: string; to: string } | undefined;
  generationVersion: number;
  savedTemplate: string | undefined;
  onTemplateChange: (template: string) => void;
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

export const AiPanelComponent = ({
  embeddableId,
  prompt,
  esqlQuery,
  timeRange,
  generationVersion,
  savedTemplate,
  onTemplateChange,
}: AiPanelComponentProps) => {
  const { euiTheme, colorMode } = useEuiTheme();
  const { html, isLoading, error, isAiUnavailable } = useAiPanelHtml({
    embeddableId,
    prompt,
    esqlQuery,
    timeRange,
    generationVersion,
    savedTemplate,
    colorMode,
    onTemplateChange,
  });

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
    <div css={wrapperCss}>
      {isLoading && <EuiProgress size="xs" color="accent" position="absolute" />}
      {isAiUnavailable && (
        <EuiEmptyPrompt
          iconType="sparkles"
          iconColor="subdued"
          title={
            <h3>
              {i18n.translate('xpack.aiPanel.aiUnavailable.title', {
                defaultMessage: 'AI not available',
              })}
            </h3>
          }
          body={
            <p>
              {i18n.translate('xpack.aiPanel.aiUnavailable.body', {
                defaultMessage:
                  'This panel requires an AI connector to generate content. Contact your administrator to configure one.',
              })}
            </p>
          }
          color="subdued"
        />
      )}
      {!isAiUnavailable && error && (
        <EuiCallOut
          color="danger"
          title={i18n.translate('xpack.aiPanel.error.title', {
            defaultMessage: 'Failed to generate panel',
          })}
          style={{ margin: euiTheme.size.base }}
          announceOnMount
        >
          {error}
        </EuiCallOut>
      )}
      {!isAiUnavailable && !error && html && (
        <div css={iframeContainerCss}>
          <iframe css={iframeCss} srcDoc={html} sandbox="" title="AI panel" />
        </div>
      )}
    </div>
  );
};
