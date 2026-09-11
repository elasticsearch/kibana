/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useRef, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiConfirmModal,
  EuiLoadingSpinner,
  EuiFlexGroup,
  EuiFlexItem,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { KbnWarningCallout } from '@kbn/ui-callout';

import { useServices, useToastNotifications } from '../app_context';
import { deleteSnapshots } from '../services/http';

interface Props {
  children: (deleteSnapshot: DeleteSnapshot) => React.ReactElement;
}

export type DeleteSnapshot = (
  ids: Array<{ snapshot: string; repository: string }>,
  onSuccess?: OnSuccessCallback
) => void;

type OnSuccessCallback = (
  snapshotsDeleted: Array<{ snapshot: string; repository: string }>
) => void;

export const SnapshotDeleteProvider: React.FunctionComponent<Props> = ({ children }) => {
  const { i18n } = useServices();
  const toastNotifications = useToastNotifications();

  const [snapshotIds, setSnapshotIds] = useState<Array<{ snapshot: string; repository: string }>>(
    []
  );
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const onSuccessCallback = useRef<OnSuccessCallback | null>(null);
  const modalTitleId = useGeneratedHtmlId();

  const deleteSnapshotPrompt: DeleteSnapshot = (ids, onSuccess = () => undefined) => {
    if (!ids || !ids.length) {
      throw new Error('No snapshot IDs specified for deletion');
    }
    setIsModalOpen(true);
    setSnapshotIds(ids);
    onSuccessCallback.current = onSuccess;
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSnapshotIds([]);
  };

  const deleteSnapshot = () => {
    const snapshotsToDelete = [...snapshotIds];
    setIsDeleting(true);
    deleteSnapshots(snapshotsToDelete).then(({ data, error }) => {
      const { itemsDeleted, errors } = data || { itemsDeleted: undefined, errors: undefined };

      // Report the result only after Elasticsearch completes the deletion request.
      closeModal();
      setIsDeleting(false);

      // Surface success notifications
      if (itemsDeleted && itemsDeleted.length) {
        const hasMultipleSuccesses = itemsDeleted.length > 1;
        const successMessage = hasMultipleSuccesses
          ? i18n.translate(
              'xpack.snapshotRestore.deleteSnapshot.successMultipleNotificationTitle',
              {
                defaultMessage: 'Deleted {count} snapshots',
                values: { count: itemsDeleted.length },
              }
            )
          : i18n.translate('xpack.snapshotRestore.deleteSnapshot.successSingleNotificationTitle', {
              defaultMessage: "Deleted snapshot ''{name}''",
              values: { name: itemsDeleted[0].snapshot },
            });
        toastNotifications.addSuccess(successMessage);
        if (onSuccessCallback.current) {
          onSuccessCallback.current([...itemsDeleted]);
        }
      }

      // Surface error notifications
      // `error` is generic server error
      // `data.errors` are specific errors with removing particular snapshot(s)
      if (error || (errors && errors.length)) {
        const hasMultipleErrors =
          (errors && errors.length > 1) || (error && snapshotsToDelete.length > 1);
        const errorMessage = hasMultipleErrors
          ? i18n.translate('xpack.snapshotRestore.deleteSnapshot.errorMultipleNotificationTitle', {
              defaultMessage: 'Error deleting {count} snapshots',
              values: {
                count: (errors && errors.length) || snapshotsToDelete.length,
              },
            })
          : i18n.translate('xpack.snapshotRestore.deleteSnapshot.errorSingleNotificationTitle', {
              defaultMessage: "Error deleting snapshot ''{name}''",
              values: { name: (errors && errors[0].id.snapshot) || snapshotsToDelete[0].snapshot },
            });
        toastNotifications.addDanger(errorMessage);
      }
    });
  };

  const renderModal = () => {
    if (!isModalOpen) {
      return null;
    }

    const isSingle = snapshotIds.length === 1;

    return (
      <EuiConfirmModal
        aria-labelledby={modalTitleId}
        title={
          isSingle ? (
            <FormattedMessage
              id="xpack.snapshotRestore.deleteSnapshot.confirmModal.deleteSingleTitle"
              defaultMessage="Delete snapshot ''{name}''?"
              values={{ name: snapshotIds[0].snapshot }}
            />
          ) : (
            <FormattedMessage
              id="xpack.snapshotRestore.deleteSnapshot.confirmModal.deleteMultipleTitle"
              defaultMessage="Delete {count} snapshots?"
              values={{ count: snapshotIds.length }}
            />
          )
        }
        titleProps={{ id: modalTitleId }}
        onCancel={closeModal}
        onConfirm={deleteSnapshot}
        cancelButtonText={
          <FormattedMessage
            id="xpack.snapshotRestore.deleteSnapshot.confirmModal.cancelButtonLabel"
            defaultMessage="Cancel"
          />
        }
        confirmButtonText={
          <FormattedMessage
            id="xpack.snapshotRestore.deleteSnapshot.confirmModal.confirmButtonLabel"
            defaultMessage="Delete {count, plural, one {snapshot} other {snapshots}}"
            values={{ count: snapshotIds.length }}
          />
        }
        confirmButtonDisabled={isDeleting}
        buttonColor="danger"
        data-test-subj="srdeleteSnapshotConfirmationModal"
      >
        {!isSingle ? (
          <Fragment>
            <p>
              <FormattedMessage
                id="xpack.snapshotRestore.deleteSnapshot.confirmModal.deleteMultipleListDescription"
                defaultMessage="You are about to delete these snapshots:"
              />
            </p>
            <ul>
              {snapshotIds.map(({ snapshot, repository }) => (
                <li key={`${repository}/${snapshot}`}>{snapshot}</li>
              ))}
            </ul>
          </Fragment>
        ) : null}
        <p>
          <FormattedMessage
            id="xpack.snapshotRestore.deleteSnapshot.confirmModal.deleteMultipleDescription"
            defaultMessage="Restore operations associated with {count, plural, one {this snapshot} other {these snapshots}} will stop."
            values={{ count: snapshotIds.length }}
          />
        </p>
        {isDeleting ? (
          <Fragment>
            <KbnWarningCallout
              announceOnMount
              title={
                <Fragment>
                  <EuiFlexGroup gutterSize="s" alignItems="center">
                    <EuiFlexItem grow={false}>
                      <EuiLoadingSpinner />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <FormattedMessage
                        id="xpack.snapshotRestore.deleteSnapshot.confirmModal.deletingCalloutTitle"
                        defaultMessage="Deleting {count, plural, one {snapshot} other {snapshots}}"
                        values={{ count: snapshotIds.length }}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </Fragment>
              }
              text={
                <p>
                  <FormattedMessage
                    id="xpack.snapshotRestore.deleteSnapshot.confirmModal.deletingCalloutDescription"
                    defaultMessage="This may take a few minutes."
                  />
                </p>
              }
            />
          </Fragment>
        ) : null}
      </EuiConfirmModal>
    );
  };

  return (
    <Fragment>
      {children(deleteSnapshotPrompt)}
      {renderModal()}
    </Fragment>
  );
};
