/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
  EuiTextColor,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import React, { useCallback } from 'react';

import type { CoreStart } from '@kbn/core/public';
import { useCurrentUser } from '@kbn/core-user-profile-browser';
import { useKibana } from '@kbn/kibana-react-plugin/public';

import { labels } from './constants/i18n';
import type {
  RevokeApplicationConnectionsModalConnection,
  RevokedApplicationConnection,
} from './constants/types';
import { useRevokeConnections } from './hooks/use_revoke_connections';

export interface RevokeApplicationConnectionsModalProps {
  connections: RevokeApplicationConnectionsModalConnection[];
  onClose: () => void;
  onRevoked?: (revoked: RevokedApplicationConnection[]) => void;
}

export const RevokeApplicationConnectionsModal = ({
  connections,
  onClose,
  onRevoked,
}: RevokeApplicationConnectionsModalProps) => {
  const modalTitleId = useGeneratedHtmlId({ prefix: 'revokeApplicationConnectionsModalTitle' });
  const { revokeConnections, isRevoking } = useRevokeConnections();
  const { services } = useKibana<CoreStart>();
  const { toasts } = services.notifications;
  const { user } = useCurrentUser();

  const count = connections.length;

  const handleRevoke = useCallback(async () => {
    try {
      const { results } = await revokeConnections({
        connections: connections.map(({ client, connectionId }) => ({
          clientId: client.id,
          connectionId,
        })),
      });

      const failures = results.filter((result) => result.status === 'error');
      const revokedConnections: RevokedApplicationConnection[] = results
        .filter((result) => result.status === 'revoked')
        .map(({ clientId, connectionId }) => ({ clientId, connectionId }));

      if (revokedConnections.length > 0) {
        onRevoked?.(revokedConnections);
      }

      if (failures.length === 0) {
        toasts.addSuccess({ title: labels.revoke.successToast(results.length) });
        onClose();
        return;
      }

      if (failures.length === results.length) {
        toasts.addDanger({ title: labels.revoke.allFailedToast(results.length) });
        return;
      }

      toasts.addWarning({
        title: labels.revoke.partialFailedToast(revokedConnections.length, results.length),
      });
      onClose();
    } catch (error) {
      toasts.addDanger({
        title: labels.revoke.unexpectedErrorToast,
        text: error instanceof Error ? error.message : String(error),
      });
    }
  }, [revokeConnections, connections, onRevoked, toasts, onClose]);

  const columns: Array<EuiBasicTableColumn<RevokeApplicationConnectionsModalConnection>> = [
    {
      field: 'connectionName',
      name: labels.revoke.connectionNameColumn,
      render: (_value, item) => item.connectionName ?? item.connectionId,
    },
    {
      field: 'client.client_name',
      name: labels.revoke.clientNameColumn,
      render: (_value, item) => item.client.client_name ?? item.client.id,
    },
    {
      field: 'userId',
      name: labels.revoke.connectedByColumn,
      render: (_value, item) => {
        if (!item.userId) {
          return <EuiTextColor color="subdued">{'—'}</EuiTextColor>;
        }
        return user && item.userId === user.username ? user.displayName : item.userId;
      },
    },
  ];

  if (count === 0) {
    return null;
  }

  return (
    <EuiModal
      aria-labelledby={modalTitleId}
      onClose={onClose}
      data-test-subj="applicationConnectionsRevokeModal"
      maxWidth={680}
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle id={modalTitleId}>{labels.revoke.title(count)}</EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText size="s">
          <p>{labels.revoke.intro}</p>
        </EuiText>
        <EuiSpacer size="l" />
        <EuiBasicTable
          tableCaption={labels.revoke.tableCaption}
          items={connections}
          columns={columns}
          itemId={(item) => `${item.client.id}-${item.connectionId}`}
          rowHeader="connectionName"
          data-test-subj="applicationConnectionsRevokeModalTable"
        />
        <EuiSpacer size="m" />
        <EuiCallOut color="warning" title={labels.revoke.calloutTitle} size="s" />
        <EuiSpacer size="m" />
        <EuiText size="s">
          <p>{labels.revoke.reconnectionNote}</p>
        </EuiText>
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose} data-test-subj="applicationConnectionsRevokeCancelButton">
          {labels.revoke.cancelButton}
        </EuiButtonEmpty>
        <EuiButton
          color="danger"
          fill
          onClick={handleRevoke}
          isLoading={isRevoking}
          disabled={isRevoking}
          data-test-subj="applicationConnectionsRevokeConfirmButton"
        >
          {labels.revoke.confirmButton}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};
