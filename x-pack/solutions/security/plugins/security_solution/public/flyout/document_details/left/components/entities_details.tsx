/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiTitle } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { useDocumentDetailsContext } from '../../shared/context';
import type { IdentityFields } from '../../shared/utils';
import {
  getField,
  resolveHostNameForEntityInsightsWithFallback,
  resolveUserNameForEntityInsightsWithFallback,
} from '../../shared/utils';
import { UserDetails } from './user_details';
import { HostDetails } from './host_details';
import { ENTITIES_DETAILS_TEST_ID } from './test_ids';
import { useEntityFromStore } from '../../../entity_details/shared/hooks/use_entity_from_store';
import type { GetFieldsData } from '../../shared/hooks/use_get_fields_data';

export const ENTITIES_TAB_ID = 'entity';

const resolveUserDisplayForEntities = (
  identityFields: IdentityFields | undefined,
  getFieldsData: GetFieldsData
): string | undefined =>
  resolveUserNameForEntityInsightsWithFallback(identityFields, getFieldsData);

const resolveHostDisplayForEntities = (
  identityFields: IdentityFields | undefined,
  getFieldsData: GetFieldsData,
  hostNameFromStore: string | undefined
): string | undefined => {
  const fromDocument = resolveHostNameForEntityInsightsWithFallback(identityFields, getFieldsData);
  return fromDocument ?? hostNameFromStore;
};

/**
 * Entities displayed in the document details expandable flyout left section under the Insights tab
 */
export const EntitiesDetails: React.FC = () => {
  const { getFieldsData, scopeId, dataAsNestedObject } = useDocumentDetailsContext();
  const timestamp = getField(getFieldsData('@timestamp'));

  const euidApi = useEntityStoreEuidApi();
  const userEntityIdentifiers = euidApi?.euid.getEntityIdentifiersFromDocument(
    'user',
    dataAsNestedObject
  ) as IdentityFields;
  const hostEntityIdentifiers = euidApi?.euid.getEntityIdentifiersFromDocument(
    'host',
    dataAsNestedObject
  ) as IdentityFields;

  /**
   * User EUID extraction applies postAggFilter (e.g. non-IDP path needs host.id), so many ECS docs
   * with user.name + host.name still get no identifiers while host extraction succeeds. Resolve the
   * display name from the document and use it for store lookup when EUID returns nothing.
   */
  const resolvedUserName = resolveUserDisplayForEntities(userEntityIdentifiers, getFieldsData);
  const legacyUserIdentityForStore =
    resolvedUserName != null && resolvedUserName !== ''
      ? ({ 'user.name': resolvedUserName } as IdentityFields)
      : undefined;

  const userEntityId = euidApi?.euid.getEuidFromObject('user', dataAsNestedObject);
  const userEntityFromStore = useEntityFromStore({
    entityId: userEntityId,
    identityFields: userEntityIdentifiers ?? legacyUserIdentityForStore,
    entityType: 'user',
    skip: userEntityIdentifiers == null && legacyUserIdentityForStore == null,
  });

  const hostEntityId = euidApi?.euid.getEuidFromObject('host', dataAsNestedObject);
  const hostEntityFromStore = useEntityFromStore({
    entityId: hostEntityId,
    identityFields: hostEntityIdentifiers ?? undefined,
    entityType: 'host',
    skip: !hostEntityIdentifiers,
  });

  const hostRecord = hostEntityFromStore.entityRecord;
  const hostNameFromStore =
    hostRecord != null && 'host' in hostRecord ? hostRecord.host?.name : undefined;

  const resolvedHostName = resolveHostDisplayForEntities(
    hostEntityIdentifiers,
    getFieldsData,
    hostNameFromStore
  );

  const userDisplayName = userEntityFromStore.entityRecord?.entity?.name ?? resolvedUserName;
  const hostDisplayName = hostEntityFromStore.entityRecord?.entity?.name ?? resolvedHostName;

  const showUserDetails = timestamp != null && userDisplayName != null;
  const showHostDetails =
    hostEntityIdentifiers != null && timestamp != null && hostDisplayName != null;
  const showDetails = showUserDetails || showHostDetails;

  return (
    <>
      {showDetails ? (
        <EuiFlexGroup direction="column" gutterSize="m" data-test-subj={ENTITIES_DETAILS_TEST_ID}>
          {showUserDetails && (
            <EuiFlexItem>
              <EuiTitle size="xs">
                <h3>
                  <FormattedMessage
                    id="xpack.securitySolution.flyout.left.insights.entities.userDetailsTitle"
                    defaultMessage="User"
                  />
                </h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <UserDetails
                userName={userDisplayName}
                entityId={userEntityFromStore?.entityRecord?.entity?.id}
                timestamp={timestamp}
                scopeId={scopeId}
              />
            </EuiFlexItem>
          )}
          {showHostDetails && (
            <EuiFlexItem>
              <EuiTitle size="xs">
                <h3>
                  <FormattedMessage
                    id="xpack.securitySolution.flyout.left.insights.entities.hostDetailsTitle"
                    defaultMessage="Host"
                  />
                </h3>
              </EuiTitle>
              <EuiSpacer size="s" />

              <HostDetails
                hostName={hostDisplayName}
                entityId={hostEntityFromStore?.entityRecord?.entity?.id}
                timestamp={timestamp}
                scopeId={scopeId}
                hostEntityFromStoreResult={hostEntityFromStore}
              />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      ) : (
        <FormattedMessage
          id="xpack.securitySolution.flyout.left.insights.entities.noDataDescription"
          defaultMessage="Host and user information are unavailable for this alert."
        />
      )}
    </>
  );
};

EntitiesDetails.displayName = 'EntitiesDetails';
