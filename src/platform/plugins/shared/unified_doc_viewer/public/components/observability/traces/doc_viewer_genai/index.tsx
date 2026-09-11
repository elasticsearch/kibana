/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiCode,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { GenAiTab } from '@kbn/apm-ui-shared';
import { FormattedMessage } from '@kbn/i18n-react';
import { KbnInfoCallout } from '@kbn/ui-callout';
import type { DocViewRenderProps } from '@kbn/unified-doc-viewer/types';
import React, { useState } from 'react';
import {
  DEFAULT_MARGIN_BOTTOM,
  getTabContentAvailableHeight,
} from '../../../doc_viewer_source/get_height';
import { TRACES_DOC_VIEWER_EBT_ELEMENTS } from '../ebt_constants';
import { GenAiDetailsTable, hasGenAiDetailFields } from './genai_details_table';
import { useGenAiData } from './use_genai_data';

export function DocViewerObsTracesGenAi({
  hit,
  dataView,
  columnsMeta,
  textBasedHits,
  filter,
  onAddColumn,
  onRemoveColumn,
  columns,
  decreaseAvailableHeightBy = DEFAULT_MARGIN_BOTTOM,
}: DocViewRenderProps) {
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
  const isEsqlMode = Array.isArray(textBasedHits);
  const { genAi, loading, unrecoverableLongFields } = useGenAiData({
    hit,
    isEsqlMode,
    indexPattern: dataView?.getIndexPattern(),
  });

  const containerHeight = containerRef
    ? getTabContentAvailableHeight(containerRef, decreaseAvailableHeightBy)
    : 0;

  if (!genAi) {
    return null;
  }

  // Only true when the query requested no metadata at all, so nothing can be
  // verified or refetched. Deliberately not gated on whether content rendered:
  // `ignore_above` drops individual elements, so a conversation can render and
  // still be truncated — that silent case is the one users most need flagged.
  const showMetadataHint = unrecoverableLongFields;

  return (
    <div
      ref={setContainerRef}
      data-test-subj="unifiedDocViewerObsTracesGenAi"
      css={
        containerHeight
          ? css`
              max-height: ${containerHeight}px;
              overflow: auto;
            `
          : undefined
      }
    >
      <EuiSpacer size="m" />
      {/*
       * Recovery only affects the conversation, so the rest of the tab renders
       * straight away rather than being replaced by a full-tab skeleton.
       * `GenAiTab` omits the conversation section entirely when it has no
       * messages, so it simply appears once the values arrive.
       */}
      {loading && (
        <>
          <EuiFlexGroup
            gutterSize="s"
            alignItems="center"
            responsive={false}
            data-test-subj="unifiedDocViewerObsTracesGenAiLoading"
          >
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="m" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s" color="subdued">
                <FormattedMessage
                  id="unifiedDocViewer.observability.traces.genAi.loadingMessages"
                  defaultMessage="Loading messages…"
                />
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
        </>
      )}
      {showMetadataHint && (
        <>
          <KbnInfoCallout
            announceOnMount
            data-test-subj="unifiedDocViewerObsTracesGenAiMetadataHint"
            title={
              <FormattedMessage
                id="unifiedDocViewer.observability.traces.genAi.metadataHint.title"
                defaultMessage="Content may be incomplete"
              />
            }
            text={
              <FormattedMessage
                id="unifiedDocViewer.observability.traces.genAi.metadataHint.description"
                defaultMessage="Values longer than 1024 characters aren't indexed and must be read from the document source. Add {metadata} to your query to load them."
                values={{
                  metadata: (
                    <EuiCode css={{ display: 'inline-block' }}>{'METADATA _id, _index'}</EuiCode>
                  ),
                }}
              />
            }
          />
          <EuiSpacer size="m" />
        </>
      )}
      <GenAiTab
        genAi={genAi}
        ebt={{ element: TRACES_DOC_VIEWER_EBT_ELEMENTS.GENAI_TAB }}
        detailsSlot={
          hasGenAiDetailFields(hit.flattened) ? (
            <GenAiDetailsTable
              hit={hit}
              dataView={dataView}
              columnsMeta={columnsMeta}
              textBasedHits={textBasedHits}
              filter={filter}
              onAddColumn={onAddColumn}
              onRemoveColumn={onRemoveColumn}
              columns={columns}
            />
          ) : undefined
        }
      />
    </div>
  );
}

// eslint-disable-next-line import/no-default-export
export default DocViewerObsTracesGenAi;
