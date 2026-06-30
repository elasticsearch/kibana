/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { MemoryDiffViewer } from './memory_diff_viewer';
import type { MemoryVersionRecord } from './types';
import { useMemoryVersion } from './use_memory';
import { changeTypeColors, changeTypeIcons } from './utils';

export function ChangeFlyout({
  change,
  onClose,
  onViewEntry,
}: {
  change: MemoryVersionRecord;
  onClose: () => void;
  onViewEntry: (id: string) => void;
}) {
  const needsPreviousVersion = change.change_type !== 'delete' && change.version > 1;
  const { data: previousVersionData, isLoading: isPrevLoading } = useMemoryVersion(
    needsPreviousVersion ? change.entry_id : undefined,
    needsPreviousVersion ? change.version - 1 : undefined
  );

  const isLoading = needsPreviousVersion && isPrevLoading;

  return (
    <EuiFlyout
      onClose={onClose}
      size="m"
      data-test-subj="streamsMemoryChangeFlyout"
      aria-label={i18n.translate('xpack.streams.memory.changeFlyoutAriaLabel', {
        defaultMessage: 'Memory change detail',
      })}
    >
      <EuiFlyoutHeader hasBorder={false}>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiBadge
              color={changeTypeColors[change.change_type] ?? 'default'}
              iconType={changeTypeIcons[change.change_type] ?? 'dot'}
            >
              {change.change_type}
            </EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2>{change.title}</h2>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued">
          {i18n.translate('xpack.streams.memory.changeMeta', {
            defaultMessage: 'v{version} · {date} · {author}',
            values: {
              version: change.version,
              date: new Date(change.created_at).toLocaleString(),
              author: change.created_by,
            },
          })}
        </EuiText>
        {change.change_summary && (
          <>
            <EuiSpacer size="xs" />
            <EuiText size="s" color="subdued">
              {change.change_summary}
            </EuiText>
          </>
        )}
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {isLoading ? (
          <EuiLoadingSpinner size="l" />
        ) : (
          <MemoryDiffViewer
            original={
              change.change_type === 'delete'
                ? {
                    title: change.title,
                    content: change.content,
                    tags: change.tags ?? [],
                    categories: change.categories ?? [],
                  }
                : {
                    title: previousVersionData?.title ?? '',
                    content: previousVersionData?.content ?? '',
                    tags: previousVersionData?.tags ?? [],
                    categories: previousVersionData?.categories ?? [],
                  }
            }
            modified={
              change.change_type === 'delete'
                ? { title: '', content: '', tags: [], categories: [] }
                : {
                    title: change.title,
                    content: change.content,
                    tags: change.tags ?? [],
                    categories: change.categories ?? [],
                  }
            }
          />
        )}
      </EuiFlyoutBody>

      {change.change_type !== 'delete' && (
        <EuiFlyoutFooter>
          <EuiButtonEmpty
            iconType="eye"
            onClick={() => {
              onClose();
              onViewEntry(change.entry_id);
            }}
            data-test-subj="streamsMemoryChangeFlyoutViewCurrentPage"
          >
            {i18n.translate('xpack.streams.memory.viewCurrentPage', {
              defaultMessage: 'View current page',
            })}
          </EuiButtonEmpty>
        </EuiFlyoutFooter>
      )}
    </EuiFlyout>
  );
}
