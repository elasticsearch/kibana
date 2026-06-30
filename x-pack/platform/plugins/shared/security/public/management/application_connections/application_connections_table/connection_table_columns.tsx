/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  EuiBasicTableColumn,
  EuiTableComputedColumnType,
  EuiTableFieldDataColumnType,
} from '@elastic/eui';
import { EuiHealth, EuiLink, EuiText, EuiTextColor, EuiToolTip, formatDate } from '@elastic/eui';
import React, { useMemo } from 'react';

import { useCurrentUser } from '@kbn/core-user-profile-browser';

import { InlineEditConnectionName } from './inline_edit_connection_name';
import { labels } from '../constants/i18n';
import type { ApplicationConnection } from '../constants/types';
import { useApplicationConnectionsActions } from '../context/application_connections_provider';

const AUTHORIZATION_DATE_FORMAT = 'll';

export const isConnectionActive = ({ client, connection }: ApplicationConnection): boolean =>
  !client.revoked && !connection.revoked;

export interface ConnectionTableColumnsOptions {
  withClientNameColumn?: boolean;
}

export const useConnectionTableColumns = ({
  withClientNameColumn = true,
}: ConnectionTableColumnsOptions = {}): Array<EuiBasicTableColumn<ApplicationConnection>> => {
  const { revokeConnections, viewClientDetails } = useApplicationConnectionsActions();
  const { user } = useCurrentUser();

  return useMemo(() => {
    const connectionNameColumn: EuiTableFieldDataColumnType<ApplicationConnection> = {
      field: 'connection.name',
      name: labels.connectionColumns.connectionName,
      sortable: ({ connection: { name, id } }) => name ?? id,
      render: (_, applicationConnection: ApplicationConnection) => {
        const { client, connection } = applicationConnection;
        const displayName = connection.name ?? connection.id;
        if (!isConnectionActive(applicationConnection)) {
          return (
            <EuiText size="s" data-test-subj={`applicationConnectionRow-${connection.id}`}>
              <EuiTextColor color="subdued">{displayName}</EuiTextColor>
            </EuiText>
          );
        }
        return (
          <span data-test-subj={`applicationConnectionRow-${connection.id}`}>
            <InlineEditConnectionName clientId={client.id} connection={connection} />
          </span>
        );
      },
    };

    const clientNameColumn: EuiTableFieldDataColumnType<ApplicationConnection> = {
      field: 'client.client_name',
      name: labels.connectionColumns.clientName,
      sortable: ({ client: { client_name, id } }) => client_name ?? id,
      render: (_, { client }: ApplicationConnection) => {
        const displayName = client.client_name ?? client.id;
        return (
          <EuiText size="s">
            <EuiLink
              color={client.revoked ? 'subdued' : 'primary'}
              onClick={() => viewClientDetails(client)}
              aria-label={labels.viewClientDetails.linkAriaLabel(displayName)}
              data-test-subj={`viewClientDetailsLink-${client.id}`}
            >
              {displayName}
            </EuiLink>
          </EuiText>
        );
      },
    };

    const authorizationDateColumn: EuiTableFieldDataColumnType<ApplicationConnection> = {
      field: 'connection.creation',
      name: labels.connectionColumns.authorizationDate,
      sortable: ({ connection }) =>
        connection.creation ? new Date(connection.creation).getTime() : 0,
      render: (_value: string | undefined, { connection }: ApplicationConnection) =>
        connection.creation ? (
          <span>{formatDate(connection.creation, AUTHORIZATION_DATE_FORMAT)}</span>
        ) : (
          <span>{'—'}</span>
        ),
    };

    const connectedByColumn: EuiTableComputedColumnType<ApplicationConnection> = {
      name: labels.connectionColumns.connectedBy,
      sortable: ({ connection }) => connection.user_id ?? '',
      render: ({ connection }: ApplicationConnection) => {
        const dataTestSubj = `applicationConnectionConnectedBy-${connection.id}`;
        if (!connection.user_id) {
          return (
            <EuiText color="subdued" size="s" data-test-subj={dataTestSubj}>
              {'—'}
            </EuiText>
          );
        }
        const displayName =
          user && connection.user_id === user.username ? user.displayName : connection.user_id;
        return (
          <EuiText size="s" data-test-subj={dataTestSubj}>
            {displayName}
          </EuiText>
        );
      },
    };

    const statusColumn: EuiTableComputedColumnType<ApplicationConnection> = {
      name: labels.connectionColumns.status,
      sortable: (applicationConnection) => (isConnectionActive(applicationConnection) ? 0 : 1),
      render: (applicationConnection) =>
        isConnectionActive(applicationConnection) ? (
          <EuiToolTip content={labels.status.connectedTooltip} position="top">
            <EuiHealth color="success">{labels.status.connected}</EuiHealth>
          </EuiToolTip>
        ) : (
          <EuiHealth color="danger">{labels.status.revoked}</EuiHealth>
        ),
    };

    const actionsColumn: EuiTableComputedColumnType<ApplicationConnection> = {
      width: '96px',
      align: 'right',
      name: labels.connectionColumns.actions,
      render: (applicationConnection) => {
        const { client, connection } = applicationConnection;
        if (!isConnectionActive(applicationConnection)) {
          return (
            <EuiText size="s" color="subdued">
              {labels.connectionColumns.revokedLabel}
            </EuiText>
          );
        }
        return (
          <EuiLink
            color="danger"
            data-test-subj={`revokeConnection-${connection.id}`}
            onClick={() =>
              revokeConnections([
                {
                  client,
                  connectionId: connection.id,
                  connectionName: connection.name,
                  userId: connection.user_id,
                },
              ])
            }
          >
            {labels.connectionColumns.revokeLabel}
          </EuiLink>
        );
      },
    };

    return [
      connectionNameColumn,
      ...(withClientNameColumn ? [clientNameColumn] : []),
      authorizationDateColumn,
      connectedByColumn,
      statusColumn,
      actionsColumn,
    ];
  }, [user, revokeConnections, viewClientDetails, withClientNameColumn]);
};
