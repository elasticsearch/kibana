/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { useEntityFromStore } from '../../../entity_details/shared/hooks/use_entity_from_store';
import { HostDetails } from '../../../document_details/left/components/host_details';
import { UserDetails } from '../../../document_details/left/components/user_details';
import type { GetFieldsData } from '../../../document_details/shared/hooks/use_get_fields_data';
import {
  createGetFieldsDataFromAlertSource,
  resolveHostNameForEntityInsightsWithFallback,
  resolveUserNameForEntityInsightsWithFallback,
  type IdentityFields,
} from '../../../document_details/shared/utils';
import type { AttackEntityListEntry } from '../../hooks/use_attack_entities_lists';

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

export interface AttackInsightsRowBaseProps extends AttackEntityListEntry {
  timestamp: string;
  scopeId: string;
}

/**
 * One host row for Attack Details entities tab: mirrors {@link EntitiesDetails} display resolution
 * (document fields + entity store) so headers use host.name, not raw EUID / entity.id.
 */
export const AttackHostInsightsRow: React.FC<AttackInsightsRowBaseProps> = memo(
  ({ identityFields, sampleSource, timestamp, scopeId }) => {
    const euidApi = useEntityStoreEuidApi();

    const getFieldsData = useMemo(
      () => createGetFieldsDataFromAlertSource(sampleSource),
      [sampleSource]
    );

    const dataAsNestedObject = sampleSource as unknown as Ecs;

    const hostEntityId = euidApi?.euid.getEuidFromObject('host', dataAsNestedObject);
    const hostEntityFromStore = useEntityFromStore({
      entityId: hostEntityId,
      identityFields: identityFields ?? undefined,
      entityType: 'host',
      skip: !identityFields,
    });

    const hostRecord = hostEntityFromStore.entityRecord;
    const hostNameFromStore =
      hostRecord != null && 'host' in hostRecord ? hostRecord.host?.name : undefined;

    const resolvedHostName = resolveHostDisplayForEntities(
      identityFields,
      getFieldsData,
      hostNameFromStore
    );

    const hostDisplayName = hostEntityFromStore.entityRecord?.entity?.name ?? resolvedHostName;

    if (hostDisplayName == null) {
      return null;
    }

    return (
      <HostDetails
        hostName={hostDisplayName}
        entityId={hostEntityFromStore?.entityRecord?.entity?.id}
        timestamp={timestamp}
        scopeId={scopeId}
        expandedOnFirstRender={false}
        isAttackDetails={true}
        hostEntityFromStoreResult={hostEntityFromStore}
      />
    );
  }
);

AttackHostInsightsRow.displayName = 'AttackHostInsightsRow';

/**
 * One user row for Attack Details entities tab: mirrors {@link EntitiesDetails} user resolution.
 */
export const AttackUserInsightsRow: React.FC<AttackInsightsRowBaseProps> = memo(
  ({ identityFields, sampleSource, timestamp, scopeId }) => {
    const euidApi = useEntityStoreEuidApi();

    const getFieldsData = useMemo(
      () => createGetFieldsDataFromAlertSource(sampleSource),
      [sampleSource]
    );

    const resolvedUserName = resolveUserDisplayForEntities(identityFields, getFieldsData);
    const legacyUserIdentityForStore =
      resolvedUserName != null && resolvedUserName !== ''
        ? ({ 'user.name': resolvedUserName } as IdentityFields)
        : undefined;

    const dataAsNestedObject = sampleSource as unknown as Ecs;

    const userEntityId = euidApi?.euid.getEuidFromObject('user', dataAsNestedObject);
    const userEntityFromStore = useEntityFromStore({
      entityId: userEntityId,
      identityFields: identityFields ?? legacyUserIdentityForStore,
      entityType: 'user',
      skip: identityFields == null && legacyUserIdentityForStore == null,
    });

    const userDisplayName = userEntityFromStore.entityRecord?.entity?.name ?? resolvedUserName;

    if (userDisplayName == null) {
      return null;
    }

    return (
      <UserDetails
        userName={userDisplayName}
        entityId={userEntityFromStore?.entityRecord?.entity?.id}
        timestamp={timestamp}
        scopeId={scopeId}
        expandedOnFirstRender={false}
        isAttackDetails={true}
      />
    );
  }
);

AttackUserInsightsRow.displayName = 'AttackUserInsightsRow';
