/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import { EuiButton } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import {
  partitionByRestriction,
  useContentListConfig,
  useContentListSelection,
  useDeleteConfirmation,
} from '@kbn/content-list-provider';
import {
  CONTENT_LIST_TEST_SUBJECTS,
  getContentListSelectionBarSubjects,
} from '@kbn/content-list-common';

export interface SelectionBarProps {
  /** Optional `data-test-subj` attribute for testing. */
  'data-test-subj'?: string;
}

/**
 * Selection actions rendered as `toolsLeft` inside the `EuiSearchBar`.
 *
 * When items are selected and `actions.delete.onBulkAction` is
 * configured, renders a "Delete {count} {entity}" button. The count
 * matches what the modal will actually delete: it partitions the
 * selection by `actions.delete.restriction` and labels the button with
 * the deletable subset. Clicking opens a {@link DeleteConfirmationModal}
 * which surfaces any skipped items.
 *
 * Returns `null` when nothing is selected or when
 * `actions.delete.onBulkAction` is not configured.
 *
 * @internal Rendered automatically by {@link ContentListToolbar}.
 */
export const SelectionBar = ({
  'data-test-subj': dataTestSubj = CONTENT_LIST_TEST_SUBJECTS.selectionBar,
}: SelectionBarProps) => {
  const { labels, item: itemConfig } = useContentListConfig();
  const { selectedItems, selectedCount, clearSelection } = useContentListSelection();
  const { requestDelete, deleteModal } = useDeleteConfirmation({ onClose: clearSelection });

  const deleteRestriction = itemConfig?.actions?.delete?.restriction;

  // Partition the current selection so the button's count and the
  // modal's `permitted`/`skipped` lists agree. `useSelection` already
  // disables checkboxes for restricted rows, so this is normally a
  // no-op; the partition is the defensive backstop for programmatic
  // selection or stale restriction predicates.
  const deletableCount = useMemo(
    () => partitionByRestriction(selectedItems, deleteRestriction).permitted.length,
    [selectedItems, deleteRestriction]
  );

  const buttonLabel = useMemo(() => {
    const hasDeletableItems = deletableCount > 0;
    const itemCount = hasDeletableItems ? deletableCount : selectedCount;

    return hasDeletableItems
      ? i18n.translate('contentManagement.contentList.toolbar.selectionBar.deleteButton', {
          defaultMessage: 'Delete {itemCount} {entityName}',
          values: {
            itemCount,
            entityName: itemCount === 1 ? labels.entity : labels.entityPlural,
          },
        })
      : i18n.translate('contentManagement.contentList.toolbar.selectionBar.reviewButton', {
          defaultMessage: 'Review {itemCount} {entityName}',
          values: {
            itemCount,
            entityName: itemCount === 1 ? labels.entity : labels.entityPlural,
          },
        });
  }, [deletableCount, selectedCount, labels.entity, labels.entityPlural]);

  if (selectedCount === 0 || typeof itemConfig?.actions?.delete?.onBulkAction !== 'function') {
    return null;
  }

  return (
    <>
      <EuiButton
        color="danger"
        iconType="trash"
        onClick={() => requestDelete(selectedItems)}
        data-test-subj={getContentListSelectionBarSubjects(dataTestSubj).deleteButton}
      >
        {buttonLabel}
      </EuiButton>
      {deleteModal}
    </>
  );
};
