/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiEmptyPrompt,
  EuiInMemoryTable,
  EuiSpacer,
  EuiText,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import type { CaseUI, AttachmentUIV2 } from '../../../../../common/ui/types';
import { FormattedRelativePreferenceDate } from '../../../formatted_date';
import { SavedObjectLink } from './saved_object_link';
import { useSavedObjectInAppUrls } from './use_saved_object_in_app_url';
import { getSavedObjectAttachmentAttributes, isSavedObjectAttachment } from './helpers';
import * as i18n from './translations';

interface SavedObjectAttachmentRow {
  /** Cases comment id (used for row keys / `data-test-subj`). */
  id: string;
  /** Display title; falls back to `attachmentId` when no title was captured at attach time. */
  title: string;
  /** Foreign SO id (used to resolve the in-app URL). */
  attachmentId: string;
  createdAt: string;
  createdBy: string;
}

export interface SavedObjectAttachmentsTableProps {
  caseData: CaseUI;
  searchTerm?: string;
  /** Attachment registration id (e.g. `dashboard`, `map`, `discoverSession`). */
  attachmentTypeId: string;
  /** SO type used for in-app URL resolution (e.g. `dashboard`, `map`, `search`). */
  soType: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const PAGINATION_PROP = {
  pageSizeOptions: PAGE_SIZE_OPTIONS,
  initialPageSize: PAGE_SIZE_OPTIONS[0],
} as const;

const formatCreatedBy = (createdBy: AttachmentUIV2['createdBy'] | undefined): string => {
  if (!createdBy) {
    return '';
  }
  return createdBy.fullName || createdBy.username || createdBy.email || '';
};

/**
 * Builds a table row from a unified attachment that points at a saved object.
 * Delegates the SO-attribute extraction to `getSavedObjectAttachmentAttributes`
 * and only layers on the table-display fields (comment id, createdAt/By,
 * title fallback) that the helper doesn't carry.
 */
const extractRow = (attachment: AttachmentUIV2): SavedObjectAttachmentRow | null => {
  if (!isSavedObjectAttachment(attachment)) {
    return null;
  }
  const attributes = getSavedObjectAttachmentAttributes(attachment);

  return {
    id: attachment.id,
    title: attributes.title || attributes.attachmentId,
    attachmentId: attributes.attachmentId,
    createdAt: attachment.createdAt,
    createdBy: formatCreatedBy(attachment.createdBy),
  };
};

/**
 * Renders a small table of saved-object attachments for a given attachment
 * type. Rows are derived from `caseData.comments` (no extra fetch); in-app
 * URLs are resolved through `useSavedObjectInAppUrls` so each title links to
 * the underlying app (or falls back to a disabled link when the SO is gone).
 *
 * Uses `EuiInMemoryTable` so pagination + page-clamping (when `searchTerm`
 * shrinks the set past the current page) are handled by EUI, not by us.
 */
export const SavedObjectAttachmentsTable: React.FC<SavedObjectAttachmentsTableProps> = ({
  caseData,
  searchTerm,
  attachmentTypeId,
  soType,
}) => {
  const allRows = useMemo<SavedObjectAttachmentRow[]>(
    () =>
      caseData.comments.reduce<SavedObjectAttachmentRow[]>((rows, attachment) => {
        if (attachment.type !== attachmentTypeId) {
          return rows;
        }
        const row = extractRow(attachment);
        if (row) {
          rows.push(row);
        }
        return rows;
      }, []),
    [caseData.comments, attachmentTypeId]
  );

  const filteredRows = useMemo<SavedObjectAttachmentRow[]>(() => {
    if (!searchTerm) {
      return allRows;
    }
    const term = searchTerm.toLowerCase();
    return allRows.filter(
      (row) =>
        row.title.toLowerCase().includes(term) || row.attachmentId.toLowerCase().includes(term)
    );
  }, [allRows, searchTerm]);

  const ids = useMemo(() => filteredRows.map((row) => row.attachmentId), [filteredRows]);
  const pathById = useSavedObjectInAppUrls(soType, ids);

  const columns = useMemo<Array<EuiBasicTableColumn<SavedObjectAttachmentRow>>>(
    () => [
      {
        name: i18n.TITLE,
        field: 'title',
        'data-test-subj': 'cases-so-attachments-table-title',
        render: (title: string, row: SavedObjectAttachmentRow) => (
          <SavedObjectLink
            title={title}
            href={pathById[row.attachmentId]}
            // Open the SO in a new tab so users keep their place in the case view.
            target="_blank"
            data-test-subj={`cases-so-attachments-table-link-${row.id}`}
          />
        ),
      },
      {
        name: i18n.DATE_ADDED,
        field: 'createdAt',
        'data-test-subj': 'cases-so-attachments-table-date-added',
        render: (createdAt: string) => <FormattedRelativePreferenceDate value={createdAt} />,
      },
      {
        name: i18n.ATTACHED_BY,
        field: 'createdBy',
        'data-test-subj': 'cases-so-attachments-table-created-by',
      },
    ],
    [pathById]
  );

  const rowProps = useCallback(
    (row: SavedObjectAttachmentRow) => ({
      'data-test-subj': `cases-so-attachments-table-row-${row.id}`,
    }),
    []
  );

  if (filteredRows.length === 0) {
    return (
      <EuiEmptyPrompt
        title={<h3>{i18n.NO_ITEMS}</h3>}
        titleSize="xs"
        data-test-subj={`cases-so-attachments-table-empty-${attachmentTypeId}`}
      />
    );
  }

  return (
    <>
      <EuiText size="xs" color="subdued" data-test-subj="cases-so-attachments-table-results-count">
        {i18n.SHOWING_COUNT(filteredRows.length)}
      </EuiText>
      <EuiSpacer size="s" />
      <EuiInMemoryTable
        tableCaption={i18n.TABLE_CAPTION}
        items={filteredRows}
        columns={columns}
        pagination={PAGINATION_PROP}
        rowProps={rowProps}
        data-test-subj={`cases-so-attachments-table-${attachmentTypeId}`}
      />
    </>
  );
};

SavedObjectAttachmentsTable.displayName = 'SavedObjectAttachmentsTable';
