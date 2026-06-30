/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { RowControlColumn } from '@kbn/discover-utils';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import type { EntityType } from '../../../../../../common/entity_analytics/types';
import { EntityTypeToIdentifierField } from '../../../../../../common/entity_analytics/types';
import { createDataProviders } from '../../../../../app/actions/add_to_timeline/data_provider';
import { getEntityFields } from '../utils';
import { ENTITY_ANALYTICS_TABLE_ID } from '../constants';

const createEntityDataProviders = (
  entityType: EntityType | undefined,
  entityName: string | undefined,
  contextId: string
) => {
  if (!entityName || !entityType) return null;
  const fieldName: string = EntityTypeToIdentifierField[entityType] || 'entity.id';
  return createDataProviders({
    contextId,
    field: fieldName,
    values: entityName,
  });
};

interface UseLeadingControlColumnsArgs {
  canUseTimeline: boolean;
  investigateInTimeline: (args: {
    query?: { query: string; language: string };
    dataProviders?: NonNullable<ReturnType<typeof createDataProviders>>;
  }) => void;
  /** Scopes "Investigate in Timeline" data providers; defaults to the EA home table id. */
  tableId?: string;
}

export const useLeadingControlColumns = ({
  canUseTimeline,
  investigateInTimeline,
  tableId = ENTITY_ANALYTICS_TABLE_ID,
}: UseLeadingControlColumnsArgs): RowControlColumn[] => {
  const euidApi = useEntityStoreEuidApi();

  return useMemo(() => {
    const columns: RowControlColumn[] = [];

    if (canUseTimeline) {
      columns.push({
        id: 'entity-analytics-timeline-action',
        render: (Control, { record }) => {
          const { entityType, entityName } = getEntityFields(record);
          if (!entityName || !entityType) {
            return <Control iconType="timeline" label="" disabled onClick={undefined} />;
          }

          return (
            <Control
              iconType="timeline"
              label={i18n.translate(
                'xpack.securitySolution.entityAnalytics.entitiesTable.investigateInTimeline',
                { defaultMessage: 'Investigate in Timeline' }
              )}
              color="text"
              onClick={() => {
                const kqlFilter = euidApi?.euid.kql.getEuidFilterBasedOnDocument(
                  entityType,
                  record.raw
                );
                if (kqlFilter) {
                  investigateInTimeline({ query: { query: kqlFilter, language: 'kuery' } });
                } else {
                  const dataProviders = createEntityDataProviders(entityType, entityName, tableId);
                  if (dataProviders?.length) {
                    investigateInTimeline({ dataProviders });
                  }
                }
              }}
              data-test-subj="entity-analytics-home-timeline-icon"
            />
          );
        },
      });
    }

    return columns;
  }, [canUseTimeline, investigateInTimeline, euidApi, tableId]);
};
