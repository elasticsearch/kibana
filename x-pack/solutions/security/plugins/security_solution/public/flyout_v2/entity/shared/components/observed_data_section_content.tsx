/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { useEntityStoreEuidApi, type EntityStoreEuid } from '@kbn/entity-store/public';
import { hostToCriteria } from '../../../../common/components/ml/criteria/host_to_criteria';
import { getCriteriaFromUsersType } from '../../../../common/components/ml/criteria/get_criteria_from_users_type';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { useInstalledSecurityJobNameById } from '../../../../common/components/ml/hooks/use_installed_security_jobs';
import type { ObservedEntityData } from './observed_entity/types';
import { ObservedEntity } from './observed_entity';
import { useObservedHostFields } from '../../host/main/hooks/use_observed_host_fields';
import { useObservedUserFields } from '../../user/main/hooks/use_observed_user_fields';
import type { OpenFlyoutLinkProps } from '../../../shared/components/open_flyout_link';
import { OpenFlyoutLink } from '../../../shared/components/open_flyout_link';
import type { HostItem, UserItem } from '../../../../../common/search_strategy';
import { buildAnomaliesTableInfluencersFilterQuery } from '../../../../common/components/ml/anomaly/anomaly_table_euid';
import { useAnomaliesTableData } from '../../../../common/components/ml/anomaly/use_anomalies_table_data';
import type { IdentityFields } from '../../../../flyout/document_details/shared/utils';
import type { EntityStoreRecord } from '../../../../flyout/entity_details/shared/hooks/use_entity_from_store';
import { EntityType } from '../../../../../common/entity_analytics/types';
import { UsersType } from '../../../../explore/users/store/model';

export type ObservedData<T> = Omit<ObservedEntityData<T>, 'anomalies'> & {
  entityRecord?: EntityStoreRecord | null;
};

export interface ObservedDataSectionProps {
  /** Whether this section is scoped to a host or user entity. Controls anomaly criteria and field layout. */
  entityType: EntityType.host | EntityType.user;
  /** Observed entity data (anomalies excluded) plus an optional Entity Store record. */
  observedData: ObservedData<HostItem> | ObservedData<UserItem>;
  /** Identity fields used to scope anomaly queries to this specific entity. */
  identityFields: IdentityFields;
  /** Resolved Entity Store record for this entity, used to enrich anomaly criteria. */
  entityRecord?: EntityStoreRecord | null;
  /** Unique id used to key the React subtree and the inspect button query. */
  contextID: string;
  /** Scope id (timeline id, table id, etc.) passed to downstream containers. */
  scopeId: string;
  /** Query id registered with the inspect button. */
  queryId: string;
}

const resolveEntityAnomalyConfig = ({
  entityType,
  observedData,
  entityRecord,
  identityFields,
  euid,
}: {
  entityType: EntityType.host | EntityType.user;
  observedData: ObservedData<HostItem> | ObservedData<UserItem>;
  entityRecord: EntityStoreRecord | null | undefined;
  identityFields: IdentityFields;
  euid: EntityStoreEuid | undefined;
}) => {
  switch (entityType) {
    case EntityType.host: {
      const nameFallback = (observedData as ObservedData<HostItem>).details?.host?.name?.[0];
      return {
        nameFallback,
        criteriaFields: hostToCriteria({
          hostItem: (observedData as ObservedData<HostItem>).details,
          entityRecord,
          euid,
        }),
      };
    }
    case EntityType.user: {
      const nameFallback = (observedData as ObservedData<UserItem>).details?.user?.name?.[0];
      return {
        nameFallback,
        criteriaFields: getCriteriaFromUsersType({
          type: UsersType.details,
          userName: nameFallback ?? '',
          entityRecord,
          identityFields,
          euid,
        }),
      };
    }
  }
};

export const ObservedDataSectionContent = memo((props: ObservedDataSectionProps) => {
  const { entityType, observedData, identityFields, entityRecord, contextID, scopeId } = props;

  const { to, from, isInitializing } = useGlobalTime();

  const { jobNameById } = useInstalledSecurityJobNameById();
  const jobIds = useMemo(() => Object.keys(jobNameById), [jobNameById]);
  const euidApi = useEntityStoreEuidApi();
  const euid = euidApi?.euid;

  const { nameFallback, criteriaFields } = resolveEntityAnomalyConfig({
    entityType,
    observedData,
    entityRecord,
    identityFields,
    euid,
  });

  const [isLoadingAnomaliesData, anomaliesData] = useAnomaliesTableData({
    criteriaFields,
    filterQuery: buildAnomaliesTableInfluencersFilterQuery({
      euid,
      entityType,
      isScopedToEntity: true,
      identityFields,
      entityRecord,
      fallbackDisplayName: nameFallback,
    }),
    startDate: from,
    endDate: to,
    skip: isInitializing,
    jobIds,
    aggregationInterval: 'auto',
  });

  const observedDataWithAnomalies = useMemo(
    () => ({
      ...observedData,
      entityId: observedData.entityRecord?.entity.id,
      anomalies: {
        isLoading: isLoadingAnomaliesData,
        anomalies: anomaliesData,
        jobNameById,
      },
    }),
    [observedData, isLoadingAnomaliesData, anomaliesData, jobNameById]
  );

  const hostFields = useObservedHostFields(
    observedDataWithAnomalies as ObservedEntityData<HostItem>
  );
  const userFields = useObservedUserFields(
    observedDataWithAnomalies as ObservedEntityData<UserItem>
  );
  const observedFields = entityType === EntityType.host ? hostFields : userFields;

  const renderFlyoutLink = useCallback(
    (flyoutLinkProps: OpenFlyoutLinkProps) => (
      <OpenFlyoutLink {...flyoutLinkProps} asParent={false} />
    ),
    []
  );

  const typedData = observedDataWithAnomalies as ObservedEntityData<HostItem & UserItem>;
  const typedFields = observedFields as typeof hostFields;

  return (
    <ObservedEntity
      observedData={typedData}
      contextID={contextID}
      scopeId={scopeId}
      observedFields={typedFields}
      entityLink={renderFlyoutLink}
    />
  );
});

ObservedDataSectionContent.displayName = 'ObservedDataSectionContent';
