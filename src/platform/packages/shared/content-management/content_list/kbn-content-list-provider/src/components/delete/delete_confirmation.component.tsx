/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiConfirmModal,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import type { ContentListItem } from '../../item';
import type { BulkActionSkippedItem } from '../../bulk_actions';

/**
 * Props for the presentational {@link DeleteConfirmationComponent}.
 *
 * The component receives a precomputed partition separating items into
 * `permitted` (will be deleted) and `skipped` (rejected by the restriction
 * predicate, with reasons).
 */
export interface DeleteConfirmationComponentProps {
  /** Items that will actually be deleted on confirm. */
  permitted: ContentListItem[];
  /** Items rejected by the delete restriction, with reasons. */
  skipped: BulkActionSkippedItem[];
  /** Singular entity name (e.g., "dashboard"). */
  entityName: string;
  /** Plural entity name (e.g., "dashboards"). */
  entityNamePlural: string;
  /** Whether a delete operation is currently executing. */
  isDeleting: boolean;
  /** Error message from the last failed attempt, displayed inline. */
  error?: string | null;
  /** Called when the user cancels (or closes the informational dialog). */
  onCancel: () => void;
  /** Called when the user confirms the delete. Never invoked in informational mode. */
  onConfirm: () => void;
}

/**
 * Stateless confirmation/explanation modal for delete operations.
 *
 * Renders one of two layouts:
 * - **Confirmable** (`permitted.length > 0`): `EuiConfirmModal` with a
 *   callout for any skipped items.
 * - **Informational** (`permitted.length === 0`): `EuiModal` explaining
 *   why no items can be deleted, with only a "Close" button.
 *
 * This dialog explains any partition that survives selection.
 * Use {@link DeleteConfirmationModal} for the connected version.
 */
export const DeleteConfirmationComponent = ({
  permitted,
  skipped,
  entityName,
  entityNamePlural,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: DeleteConfirmationComponentProps) => {
  const titleId = useGeneratedHtmlId({ prefix: 'contentListDeleteConfirmationTitle' });
  const permittedCount = permitted.length;
  const skippedCount = skipped.length;
  const permittedEntityName = permittedCount === 1 ? entityName : entityNamePlural;
  const skippedEntityName = skippedCount === 1 ? entityName : entityNamePlural;

  if (permittedCount === 0) {
    return (
      <EuiModal
        aria-labelledby={titleId}
        onClose={onCancel}
        data-test-subj={CONTENT_LIST_TEST_SUBJECTS.deleteConfirmation}
      >
        <EuiModalHeader>
          <EuiModalHeaderTitle id={titleId}>
            {i18n.translate('contentManagement.contentList.deleteConfirmation.ineligibleTitle', {
              defaultMessage: "{skippedCount} {skippedEntityName} can't be deleted",
              values: { skippedCount, skippedEntityName },
            })}
          </EuiModalHeaderTitle>
        </EuiModalHeader>
        <EuiModalBody>
          <EuiText size="s">
            <p>
              {i18n.translate('contentManagement.contentList.deleteConfirmation.ineligibleBody', {
                defaultMessage: 'None of the selected {entityNamePlural} can be deleted:',
                values: { entityNamePlural },
              })}
            </p>
          </EuiText>
          <EuiSpacer size="s" />
          <SkippedItemList skipped={skipped} />
        </EuiModalBody>
        <EuiModalFooter>
          <EuiButton
            onClick={onCancel}
            fill
            data-test-subj={CONTENT_LIST_TEST_SUBJECTS.deleteConfirmationCloseButton}
          >
            {i18n.translate('contentManagement.contentList.deleteConfirmation.close', {
              defaultMessage: 'Close',
            })}
          </EuiButton>
        </EuiModalFooter>
      </EuiModal>
    );
  }

  return (
    <EuiConfirmModal
      aria-labelledby={titleId}
      title={i18n.translate('contentManagement.contentList.deleteConfirmation.title', {
        defaultMessage: 'Delete {permittedCount} {permittedEntityName}?',
        values: { permittedCount, permittedEntityName },
      })}
      titleProps={{ id: titleId }}
      onCancel={onCancel}
      onConfirm={onConfirm}
      cancelButtonText={i18n.translate('contentManagement.contentList.deleteConfirmation.cancel', {
        defaultMessage: 'Cancel',
      })}
      confirmButtonText={
        isDeleting
          ? i18n.translate('contentManagement.contentList.deleteConfirmation.deleting', {
              defaultMessage: 'Deleting',
            })
          : i18n.translate('contentManagement.contentList.deleteConfirmation.confirm', {
              defaultMessage: 'Delete',
            })
      }
      defaultFocusedButton="cancel"
      buttonColor="danger"
      isLoading={isDeleting}
      data-test-subj={CONTENT_LIST_TEST_SUBJECTS.deleteConfirmation}
    >
      {skippedCount > 0 && (
        <>
          <EuiCallOut
            announceOnMount
            size="s"
            color="primary"
            iconType="iInCircle"
            title={i18n.translate(
              'contentManagement.contentList.deleteConfirmation.skippedCalloutTitle',
              {
                defaultMessage:
                  "{skippedCount} {skippedEntityName} can't be deleted and will be skipped",
                values: { skippedCount, skippedEntityName },
              }
            )}
            data-test-subj={CONTENT_LIST_TEST_SUBJECTS.deleteConfirmationSkippedCallout}
          >
            <SkippedItemList skipped={skipped} compact />
          </EuiCallOut>
          <EuiSpacer size="s" />
        </>
      )}
      <p>
        {i18n.translate('contentManagement.contentList.deleteConfirmation.body', {
          defaultMessage: "You can't recover deleted {entityNamePlural}.",
          values: { entityNamePlural },
        })}
      </p>
      {error && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            announceOnMount
            size="s"
            color="danger"
            title={i18n.translate('contentManagement.contentList.deleteConfirmation.error', {
              defaultMessage: 'Unable to delete {entityNamePlural}',
              values: { entityNamePlural },
            })}
            data-test-subj={CONTENT_LIST_TEST_SUBJECTS.deleteError}
          >
            <p>{error}</p>
          </EuiCallOut>
        </>
      )}
    </EuiConfirmModal>
  );
};

/**
 * Render the list of skipped items inside the dialog.
 *
 * When every skipped item shares the same reason, render the reason once
 * with the items as a bulleted list under it. Otherwise itemise as
 * `<title> - <reason>` per line so each row carries its own explanation.
 */
const SkippedItemList = ({
  skipped,
  compact = false,
}: {
  skipped: BulkActionSkippedItem[];
  compact?: boolean;
}) => {
  const reasons = new Set(skipped.map((s) => s.reason));
  const uniformReason = reasons.size === 1 ? skipped[0].reason : undefined;

  return (
    <EuiText
      size={compact ? 'xs' : 's'}
      data-test-subj={CONTENT_LIST_TEST_SUBJECTS.deleteConfirmationSkippedList}
    >
      {uniformReason ? (
        <>
          <p>{uniformReason}</p>
          <ul>
            {skipped.map(({ item }) => (
              <li key={item.id}>{item.title}</li>
            ))}
          </ul>
        </>
      ) : (
        <ul>
          {skipped.map(({ item, reason }) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              {' - '}
              {reason}
            </li>
          ))}
        </ul>
      )}
    </EuiText>
  );
};
