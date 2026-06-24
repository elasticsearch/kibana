/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense } from 'react';
import { EuiLoadingSpinner } from '@elastic/eui';
import type { CommonAttachmentTabViewProps } from '../../../../client/attachment_framework/types';
import type { SavedObjectAttachmentsTableProps } from './saved_object_attachments_table';

const SavedObjectAttachmentsTableLazy = React.lazy(async () => {
  const { SavedObjectAttachmentsTable } = await import('./saved_object_attachments_table');
  return { default: SavedObjectAttachmentsTable };
});

type StaticTabProps = Pick<SavedObjectAttachmentsTableProps, 'attachmentTypeId' | 'soType'>;

/**
 * Factory that returns the `children` component for an SO-typed attachment's
 * tab view (`getAttachmentTabViewObject`). Defers the table chunk
 * (`EuiInMemoryTable` + helpers, ~5 KB compressed) behind a `React.lazy` +
 * `Suspense` boundary so it isn't paid on the eager `cases` page-load bundle.
 *
 * Each attachment type (dashboard / map / discoverSession) bakes in its own
 * constants (`attachmentTypeId`, `soType`) at registration time and passes
 * only the framework-provided per-render props (`caseData`, `searchTerm`).
 */
export const createSavedObjectAttachmentsTab = ({
  attachmentTypeId,
  soType,
}: StaticTabProps): React.FC<CommonAttachmentTabViewProps> => {
  const SavedObjectAttachmentsTab: React.FC<CommonAttachmentTabViewProps> = ({
    caseData,
    searchTerm,
  }) => (
    <Suspense fallback={<EuiLoadingSpinner size="m" />}>
      <SavedObjectAttachmentsTableLazy
        caseData={caseData}
        searchTerm={searchTerm}
        attachmentTypeId={attachmentTypeId}
        soType={soType}
      />
    </Suspense>
  );

  SavedObjectAttachmentsTab.displayName = `SavedObjectAttachmentsTab(${attachmentTypeId})`;
  return SavedObjectAttachmentsTab;
};
