/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import React, { useMemo } from 'react';
import {
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import {
  formatFieldStringValueWithHighlights,
  getMessageFieldWithFallbacks,
  type DataTableRecord,
  type LogDocumentOverview,
} from '@kbn/discover-utils';
import type { ObservabilityStreamsFeature } from '@kbn/discover-shared-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/common';
import { Badges } from '../badges/badges';
import { HoverActionPopover } from '../hover_popover_action';
import { getUnifiedDocViewerServices } from '../../../../plugin';

export const ContentBreakdown = ({
  dataView,
  formattedDoc,
  hit,
  renderFlyoutStreamProcessingLink,
  cpsHasLinkedProjects,
}: {
  dataView: DataView;
  formattedDoc: LogDocumentOverview;
  hit: DataTableRecord;
  renderFlyoutStreamProcessingLink?: ObservabilityStreamsFeature['renderFlyoutStreamProcessingLink'];
  cpsHasLinkedProjects?: boolean;
}) => {
  const { fieldFormats } = getUnifiedDocViewerServices();
  const { field, value, formattedValue } = getMessageFieldWithFallbacks(hit.flattened, {
    includeFormattedValue: true,
  });

  const rawFieldValue = hit && field ? hit.flattened[field] : undefined;

  const messageCodeBlockProps = useMemo(
    () =>
      formattedValue
        ? { language: 'json', children: formattedValue }
        : {
            language: 'txt',
            // Pass field name for highlight lookup in hit.highlight.
            // The field may not exist in the data view (e.g., OTel body.text) but highlights should still apply.
            children: formatFieldStringValueWithHighlights({
              value: value ?? '',
              hit: hit.raw,
              fieldFormats,
              dataView,
              fieldName: field,
            }),
          },
    [dataView, field, fieldFormats, formattedValue, hit.raw, value]
  );
  const hasMessageField = field && value;

  return (
    <>
      <EuiPanel paddingSize="s" hasBorder hasShadow={false}>
        <EuiFlexGroup
          direction="column"
          gutterSize="s"
          data-test-subj="unifiedDocViewLogsOverviewMessage"
        >
          <EuiFlexGroup
            alignItems="flexEnd"
            gutterSize="none"
            justifyContent="spaceBetween"
            responsive={false}
          >
            <EuiText color="subdued" size="xs">
              {field}
            </EuiText>
            <EuiFlexItem grow={false}>
              <Badges
                dataView={dataView}
                hasMessageField={Boolean(hasMessageField)}
                hit={hit}
                formattedDoc={formattedDoc}
                renderFlyoutStreamProcessingLink={renderFlyoutStreamProcessingLink}
                cpsHasLinkedProjects={cpsHasLinkedProjects}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          {hasMessageField && (
            <HoverActionPopover
              value={value}
              formattedValue={formattedValue}
              field={field}
              rawFieldValue={rawFieldValue}
              anchorPosition="downCenter"
              display="block"
            >
              <EuiCodeBlock
                overflowHeight={100}
                paddingSize="s"
                isCopyable
                fontSize="s"
                {...messageCodeBlockProps}
              />
            </HoverActionPopover>
          )}
        </EuiFlexGroup>
      </EuiPanel>
      <EuiSpacer size="s" />
    </>
  );
};
