/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { css } from '@emotion/react';
import { EuiFlexGroup, EuiFlexItem, EuiProgress } from '@elastic/eui';
import {
  type SearchResponseWarning,
  SearchResponseWarningsBadge,
} from '@kbn/search-response-warnings';
import type { InlineEditing } from './saved_search_grid';
import { TotalDocuments } from '../../application/main/components/total_documents/total_documents';
import { InlineEditFooter } from './inline_edit_footer';

const containerStyles = css`
  width: 100%;
  position: relative;
`;

const constrainWidthStyles = css`
  min-width: 0;
`;

const gridAreaStyles = css`
  min-height: 0;
`;

export interface SavedSearchEmbeddableBaseProps {
  isLoading: boolean;
  totalHitCount?: number;
  prepend?: React.ReactElement;
  append?: React.ReactElement;
  interceptedWarnings?: SearchResponseWarning[];
  inlineEditing?: InlineEditing;
  constrainWidth?: boolean;
}

export const SavedSearchEmbeddableBase: FC<PropsWithChildren<SavedSearchEmbeddableBaseProps>> = ({
  isLoading,
  totalHitCount,
  prepend,
  append,
  interceptedWarnings,
  inlineEditing,
  constrainWidth = false,
  children,
}) => {
  return (
    <EuiFlexGroup
      css={[containerStyles, constrainWidth ? constrainWidthStyles : undefined]}
      direction="column"
      gutterSize="xs"
      responsive={false}
      data-test-subj="embeddedSavedSearchDocTable"
    >
      {isLoading && <EuiProgress size="xs" color="accent" position="absolute" />}

      {Boolean(prepend || totalHitCount) && (
        <EuiFlexItem grow={false}>
          <EuiFlexGroup
            justifyContent="flexEnd"
            alignItems="center"
            gutterSize="xs"
            responsive={false}
            wrap={true}
          >
            {Boolean(prepend) && <EuiFlexItem grow={false}>{prepend}</EuiFlexItem>}

            {!!totalHitCount && (
              <EuiFlexItem grow={false} data-test-subj="toolBarTotalDocsText">
                <TotalDocuments totalHitCount={totalHitCount} />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      )}

      <EuiFlexGroup
        css={[gridAreaStyles, constrainWidth ? constrainWidthStyles : undefined]}
        responsive={false}
        direction="column"
        gutterSize="none"
      >
        <EuiFlexItem css={[gridAreaStyles, constrainWidth ? constrainWidthStyles : undefined]}>
          {children}
        </EuiFlexItem>

        {Boolean(append) && <EuiFlexItem grow={false}>{append}</EuiFlexItem>}
        {inlineEditing?.isActive && (
          <EuiFlexItem grow={false}>
            <InlineEditFooter inlineEditing={inlineEditing} />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      <SearchResponseWarningsBadge warnings={interceptedWarnings ?? []} />
    </EuiFlexGroup>
  );
};
