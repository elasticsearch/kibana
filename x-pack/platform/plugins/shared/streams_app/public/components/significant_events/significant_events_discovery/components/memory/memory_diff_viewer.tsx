/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/css';
import { i18n } from '@kbn/i18n';
import { diffLines } from 'diff';

export interface MemorySnapshot {
  title: string;
  content: string;
  tags: string[];
  categories: string[];
}

export function MemoryDiffViewer({
  original,
  modified,
}: {
  original: MemorySnapshot;
  modified: MemorySnapshot;
}) {
  const { euiTheme } = useEuiTheme();

  const sections = [
    {
      label: i18n.translate('xpack.streams.memory.diffTitleLabel', { defaultMessage: 'Title' }),
      originalText: original.title,
      modifiedText: modified.title,
    },
    {
      label: i18n.translate('xpack.streams.memory.diffCategoriesLabel', {
        defaultMessage: 'Categories',
      }),
      originalText: original.categories.join('\n'),
      modifiedText: modified.categories.join('\n'),
    },
    {
      label: i18n.translate('xpack.streams.memory.diffTagsLabel', { defaultMessage: 'Tags' }),
      originalText: original.tags.join('\n'),
      modifiedText: modified.tags.join('\n'),
    },
    {
      label: i18n.translate('xpack.streams.memory.diffContentLabel', {
        defaultMessage: 'Content',
      }),
      originalText: original.content,
      modifiedText: modified.content,
      alwaysShow: true,
    },
  ].filter((s) => s.alwaysShow || s.originalText !== s.modifiedText);

  return (
    <EuiFlexGroup direction="column" gutterSize="s" data-test-subj="streamsMemoryDiffViewer">
      {sections.map((section) => {
        const parts = diffLines(section.originalText, section.modifiedText);
        return (
          <EuiFlexItem key={section.label}>
            <EuiText
              size="xs"
              color="subdued"
              className={css`
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 4px;
              `}
            >
              {section.label}
            </EuiText>
            <pre
              className={css`
                font-family: ${euiTheme.font.familyCode};
                font-size: 12px;
                white-space: pre-wrap;
                word-break: break-word;
                margin: 0;
                padding: 8px;
                background: ${euiTheme.colors.lightestShade};
                border-radius: ${euiTheme.border.radius.small};
              `}
            >
              {parts.map((part, idx) => (
                <span
                  key={idx}
                  className={css`
                    background: ${part.added
                      ? euiTheme.colors.success + '33'
                      : part.removed
                      ? euiTheme.colors.danger + '33'
                      : 'transparent'};
                    text-decoration: ${part.removed ? 'line-through' : 'none'};
                  `}
                >
                  {part.added ? '+ ' : part.removed ? '- ' : ''}
                  {part.value}
                </span>
              ))}
            </pre>
          </EuiFlexItem>
        );
      })}
    </EuiFlexGroup>
  );
}
