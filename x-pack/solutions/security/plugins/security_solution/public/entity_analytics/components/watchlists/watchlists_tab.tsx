/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiButton, EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { StoreStatusEnum } from '../../../../common/entity_analytics/entity_store/types';
import { useSpaceId } from '../../../common/hooks/use_space_id';
import { WatchlistsFlyoutKey } from '../../../flyout/entity_details/shared/constants';
import { useEntityStoreStatus } from '../entity_store/hooks/use_entity_store';
import { useWatchlistsPrivileges } from '../../api/hooks/use_watchlists_privileges';
import { MissingPrivilegesCallout } from '../missing_privileges_callout';
import { Watchlists } from '.';

export const WatchlistsTab: React.FC = () => {
  const { openFlyout } = useExpandableFlyoutApi();
  const spaceId = useSpaceId();
  const entityStoreStatusQuery = useEntityStoreStatus({
    enabled: true,
  });
  const storeStatus = entityStoreStatusQuery.data?.status;
  const isEntityStoreRunning = storeStatus === StoreStatusEnum.running;
  const { data: privileges, error, isLoading } = useWatchlistsPrivileges();
  const canRead = privileges?.has_read_permissions ?? false;
  const canWrite = privileges?.has_write_permissions ?? false;
  const hasAllRequired = privileges?.has_all_required ?? false;

  const handleCreateClick = () => {
    openFlyout({
      right: {
        id: WatchlistsFlyoutKey,
        params: {
          mode: 'create',
          spaceId,
        },
      },
    });
  };

  const entityStoreNotRunningCallout = useMemo(() => {
    if (
      entityStoreStatusQuery.isLoading ||
      entityStoreStatusQuery.isError ||
      isEntityStoreRunning
    ) {
      return null;
    }

    const calloutBody =
      storeStatus === StoreStatusEnum.installing ? (
        <FormattedMessage
          id="xpack.securitySolution.entityAnalytics.watchlists.entityStoreInstalling.body"
          defaultMessage="You can still view and create watchlists below. They will not sync with the Entity Store until installation finishes. Check the Engine Status tab for progress."
        />
      ) : storeStatus === StoreStatusEnum.stopped ? (
        <FormattedMessage
          id="xpack.securitySolution.entityAnalytics.watchlists.entityStoreStopped.body"
          defaultMessage="You can still view and create watchlists below. Start the Entity Store with the Entity Analytics toggle to allow watchlists to sync entities."
        />
      ) : storeStatus === StoreStatusEnum.error ? (
        <FormattedMessage
          id="xpack.securitySolution.entityAnalytics.watchlists.entityStoreError.body"
          defaultMessage="You can still view and create watchlists below. Fix the Entity Store from the Engine Status tab so watchlists can sync with entities."
        />
      ) : (
        <FormattedMessage
          id="xpack.securitySolution.entityAnalytics.watchlists.entityStoreNotRunning.body"
          defaultMessage="You can still view and create watchlists below. Install and start the Entity Store with the Entity Analytics toggle above so watchlists can sync with entities."
        />
      );

    return (
      <EuiCallOut
        announceOnMount={false}
        data-test-subj="watchlistsEntityStoreNotRunningCallout"
        title={
          <FormattedMessage
            id="xpack.securitySolution.entityAnalytics.watchlists.entityStoreNotRunning.title"
            defaultMessage="Entity Store is not running"
          />
        }
        color="warning"
        iconType="alert"
      >
        <EuiText size="s">{calloutBody}</EuiText>
      </EuiCallOut>
    );
  }, [
    entityStoreStatusQuery.isError,
    entityStoreStatusQuery.isLoading,
    isEntityStoreRunning,
    storeStatus,
  ]);

  return (
    <>
      <EuiSpacer size="m" />
      {entityStoreStatusQuery.isError ? (
        <>
          <EuiCallOut
            announceOnMount={false}
            data-test-subj="watchlistsEntityStoreStatusErrorCallout"
            title={
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.watchlists.entityStoreStatusError.title"
                defaultMessage="Unable to verify Entity Store status"
              />
            }
            color="danger"
            iconType="cross"
          >
            <EuiText size="s">
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.watchlists.entityStoreStatusError.body"
                defaultMessage="You can still use watchlists below. Sync with the Entity Store may not work until status can be loaded; try reloading the page."
              />
            </EuiText>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      ) : null}
      {entityStoreNotRunningCallout ? (
        <>
          {entityStoreNotRunningCallout}
          <EuiSpacer size="m" />
        </>
      ) : null}
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiButton
            iconType="plusInCircle"
            fill
            onClick={handleCreateClick}
            isDisabled={isLoading || !!error || !hasAllRequired}
            data-test-subj="watchlistsTabCreateButton"
          >
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.watchlists.tab.createButtonLabel"
              defaultMessage="Create watchlist"
            />
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      {privileges && canRead && !hasAllRequired && (
        <>
          <EuiSpacer size="m" />
          <MissingPrivilegesCallout
            privileges={privileges}
            title={
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.watchlists.tab.missingPrivilegesCreateOrDelete.title"
                defaultMessage="Insufficient privileges to create or delete watchlists"
              />
            }
          />
        </>
      )}
      <EuiSpacer size="m" />
      <Watchlists
        privileges={privileges}
        error={error}
        isLoading={isLoading}
        canRead={canRead}
        canWrite={canWrite}
      />
    </>
  );
};
