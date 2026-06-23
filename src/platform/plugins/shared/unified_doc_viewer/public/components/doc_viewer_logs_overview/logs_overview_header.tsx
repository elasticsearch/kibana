/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { useGeneratedHtmlId } from '@elastic/eui';
import type { LogDocumentOverview } from '@kbn/discover-utils';

import { i18n } from '@kbn/i18n';
import type { ObservabilityStreamsFeature } from '@kbn/discover-shared-plugin/public';
import type { DocViewRenderProps } from '@kbn/unified-doc-viewer/types';
import { ContentFrameworkSection } from '../..';
import { LogsOverviewHighlights } from './logs_overview_highlights';
import { ContentBreakdown } from './sub_components/content_breakdown/content_breakdown';

export const contentLabel = i18n.translate('unifiedDocViewer.docView.logsOverview.label.content', {
  defaultMessage: 'Content breakdown',
});

interface LogsOverviewHeaderProps
  extends Pick<
    DocViewRenderProps,
    'filter' | 'onAddColumn' | 'onRemoveColumn' | 'hit' | 'dataView'
  > {
  formattedDoc: LogDocumentOverview;
  renderFlyoutStreamProcessingLink?: ObservabilityStreamsFeature['renderFlyoutStreamProcessingLink'];
  cpsHasLinkedProjects?: boolean;
}

export function LogsOverviewHeader({
  hit,
  formattedDoc,
  dataView,
  filter,
  onAddColumn,
  onRemoveColumn,
  renderFlyoutStreamProcessingLink,
  cpsHasLinkedProjects,
}: LogsOverviewHeaderProps) {
  const accordionId = useGeneratedHtmlId({
    prefix: contentLabel,
  });

  return (
    <ContentFrameworkSection
      id={accordionId}
      title={contentLabel}
      data-test-subj="unifiedDocViewLogsOverviewHeader"
      hasBorder={false}
      hasPadding={false}
    >
      <ContentBreakdown
        dataView={dataView}
        formattedDoc={formattedDoc}
        hit={hit}
        renderFlyoutStreamProcessingLink={renderFlyoutStreamProcessingLink}
        cpsHasLinkedProjects={cpsHasLinkedProjects}
      />

      <LogsOverviewHighlights
        formattedDoc={formattedDoc}
        hit={hit}
        dataView={dataView}
        filter={filter}
        onAddColumn={onAddColumn}
        onRemoveColumn={onRemoveColumn}
      />
    </ContentFrameworkSection>
  );
}
