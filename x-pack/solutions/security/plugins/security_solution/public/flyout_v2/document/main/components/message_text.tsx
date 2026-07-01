/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EuiMarkdownFormat,
  EuiSpacer,
  EuiTable,
  EuiTableHeaderCell,
  EuiTableRow,
  EuiTableRowCell,
  EuiText,
  getDefaultEuiMarkdownParsingPlugins,
  getDefaultEuiMarkdownProcessingPlugins,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useMemo } from 'react';
import { CustomCodeBlock } from '@kbn/elastic-assistant/impl/get_comments/custom_codeblock/custom_code_block';
import { customCodeBlockLanguagePlugin } from '@kbn/elastic-assistant/impl/get_comments/custom_codeblock/custom_codeblock_markdown_plugin';

export const MESSAGE_TEXT_TEST_ID = 'document-flyout-ai-summary-message-text';

const getPluginDependencies = () => {
  const parsingPlugins = getDefaultEuiMarkdownParsingPlugins();

  const processingPlugins = getDefaultEuiMarkdownProcessingPlugins();

  const { components } = processingPlugins[1][1];

  processingPlugins[1][1].components = {
    ...components,
    contentReference: () => null,
    customCodeBlock: (props) => (
      <>
        <CustomCodeBlock value={props.value} lang={props.lang} />
        <EuiSpacer size="m" />
      </>
    ),
    table: (props) => (
      <>
        <EuiTable {...props} />
        <EuiSpacer size="m" />
      </>
    ),
    th: (props) => {
      const { children, ...rest } = props;
      return <EuiTableHeaderCell {...rest}>{children}</EuiTableHeaderCell>;
    },
    tr: (props) => <EuiTableRow {...props} />,
    td: (props) => {
      const { children, ...rest } = props;
      return (
        <EuiTableRowCell truncateText={true} {...rest}>
          {children}
        </EuiTableRowCell>
      );
    },
  };

  return {
    parsingPluginList: [customCodeBlockLanguagePlugin, ...parsingPlugins],
    processingPluginList: processingPlugins,
  };
};

export interface MessageTextProps {
  /**
   * Value to render within the EuiMarkdownFormat
   */
  content: string;
  /**
   * For testing
   */
  ['data-test-subj']?: string;
}

/**
 * Renders the AI-generated alert summary text as markdown.
 *
 * Used in the AI summary section of the EASE, legacy, and v2 alert flyouts.
 * For the AI Assistant chat itself, see
 * `x-pack/solutions/security/plugins/security_solution/public/assistant/get_comments/stream/message_text.tsx`.
 *
 * This component does not render content references, does not show a loading
 * cursor, and does not augmentMessageCodeBlocks.
 */
export function MessageText({ content, 'data-test-subj': dataTestSubj }: MessageTextProps) {
  const containerCss = css`
    overflow-wrap: anywhere;
  `;

  const { parsingPluginList, processingPluginList } = useMemo(() => getPluginDependencies(), []);

  return (
    <EuiText css={containerCss} data-test-subj={dataTestSubj}>
      <EuiMarkdownFormat
        data-test-subj={MESSAGE_TEXT_TEST_ID}
        parsingPluginList={parsingPluginList}
        processingPluginList={processingPluginList}
        textSize="s"
      >
        {content}
      </EuiMarkdownFormat>
    </EuiText>
  );
}
