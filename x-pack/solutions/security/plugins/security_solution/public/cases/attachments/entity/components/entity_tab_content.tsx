/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiEmptyPrompt, EuiFlexItem, EuiLoadingSpinner, EuiSpacer } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type * as estypes from '@elastic/elasticsearch/lib/api/types';
import type { CommonAttachmentTabViewProps } from '@kbn/cases-plugin/public';
import {
  ENTITY_TAB_EMPTY_TEST_ID,
  ENTITY_TAB_NO_PRIVILEGES_TEST_ID,
  ENTITY_TAB_TABLE_TEST_ID,
} from '../../../../../common/cases/attachments/entity/test_ids';
import {
  DataViewContext,
  EntitiesTableSection,
} from '../../../../entity_analytics/components/home/entities_table';
import { useEntityStoreDataView } from '../../../../entity_analytics/components/home/use_entity_store_data_view';
import { useEntityStoreStatus } from '../../../../entity_analytics/components/entity_store/hooks/use_entity_store';
import { useEntityEnginePrivileges } from '../../../../entity_analytics/components/entity_store/hooks/use_entity_engine_privileges';
import { useMissingRiskEnginePrivileges } from '../../../../entity_analytics/hooks/use_missing_risk_engine_privileges';
import { EntityAnalyticsReadPrivilegesCallout } from '../../../../entity_analytics/components/entity_analytics_read_privileges_callout';
import { EntityStoreDisabledEmptyPromptBody } from '../../../../entity_analytics/pages/entity_store_disabled_empty_prompt';
import { useSpaceId } from '../../../../common/hooks/use_space_id';
import { useEntityLocalTableState } from '../hooks/use_entity_local_table_state';
import { isEntityAttachment, matchesSearchTerm, CASE_ATTACHMENT_TABLE_CONFIG } from '../utils';

/**
 * Renders the "Entities" accordion body in the case Attachments tab.
 * Filters comments by `searchTerm` in-memory before delegating to `EntityTabTable`,
 * short-circuiting with an empty prompt when there are no matching entity attachments.
 */
export const EntityTabContent: React.FC<CommonAttachmentTabViewProps> = ({
  caseData,
  searchTerm,
}) => {
  // Filter in-memory first to avoid firing an ES query when no attachments match the search.
  // `attachmentId` holds the canonical entity.id (EUID), so we only need the ids here.
  const entityIds = useMemo<string[]>(
    () =>
      caseData.comments.flatMap((comment) =>
        isEntityAttachment(comment) &&
        (!searchTerm || matchesSearchTerm(comment.metadata, searchTerm))
          ? [comment.attachmentId]
          : []
      ),
    [caseData.comments, searchTerm]
  );

  if (entityIds.length === 0) {
    return (
      <EuiEmptyPrompt
        data-test-subj={ENTITY_TAB_EMPTY_TEST_ID}
        iconType="globe"
        iconColor="default"
        titleSize="xs"
        body={
          <p>
            {searchTerm ? (
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.cases.tab.noResults"
                defaultMessage="No entities match your search."
              />
            ) : (
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.cases.tab.empty"
                defaultMessage="No entities have been attached to this case yet."
              />
            )}
          </p>
        }
      />
    );
  }

  return <EntityTabTable entityIds={entityIds} />;
};

/** Deferred inner component — keeps entity store hooks from running on cases with no entity attachments. */
const EntityTabTable = ({ entityIds }: { entityIds: string[] }) => {
  const spaceId = useSpaceId();
  const { data: entityStoreStatusData, isLoading: isStatusLoading } = useEntityStoreStatus();
  const { dataView, isLoading: isDataViewLoading } = useEntityStoreDataView(spaceId);
  // `EntitiesTableSection` doesn't gate on privileges; without this check a user
  // with cases access but no EA read privileges would see an empty grid.
  const {
    data: privileges,
    isLoading: isPrivilegesLoading,
    isError: isPrivilegesError,
  } = useEntityEnginePrivileges();
  // `readonly: true` checks only read privileges, not run/enable cluster privileges.
  const riskEngineReadPrivileges = useMissingRiskEnginePrivileges({ readonly: true });

  const isEntityStoreDisabled =
    entityStoreStatusData?.status === 'not_installed' ||
    entityStoreStatusData?.status === 'stopped';

  // Only treat as missing privileges on a successful response; errors fall through
  // to avoid hiding the table on transient failures.
  const hasNoReadPrivileges = !isPrivilegesError && !privileges?.has_read_permissions;

  // `attachmentId` holds the canonical entity.id (EUID), so a single `terms`
  // query on `entity.id` resolves every attached entity unambiguously.
  const pinnedFilter = useMemo<estypes.QueryDslQueryContainer>(
    () => ({ terms: { 'entity.id': entityIds } }),
    [entityIds]
  );

  const state = useEntityLocalTableState({ pinnedFilter });

  if (isStatusLoading || isDataViewLoading || isPrivilegesLoading) {
    return <EuiLoadingSpinner size="l" />;
  }

  if (isEntityStoreDisabled) {
    return (
      <>
        <EuiSpacer size="s" />
        <EntityStoreDisabledEmptyPromptBody />
        <EuiSpacer size="s" />
      </>
    );
  }

  const privilegesCallout = (
    <EntityAnalyticsReadPrivilegesCallout
      riskEngineReadPrivileges={riskEngineReadPrivileges}
      entityEnginePrivileges={privileges}
      id="entity-analytics-cases"
      dismissible={false}
    />
  );

  if (hasNoReadPrivileges) {
    return (
      <EuiFlexItem data-test-subj={ENTITY_TAB_NO_PRIVILEGES_TEST_ID}>
        {privilegesCallout}
      </EuiFlexItem>
    );
  }

  return (
    <>
      {privilegesCallout}
      <EuiFlexItem data-test-subj={ENTITY_TAB_TABLE_TEST_ID}>
        <DataViewContext.Provider value={{ dataView, dataViewIsLoading: isDataViewLoading }}>
          <EntitiesTableSection state={state} config={CASE_ATTACHMENT_TABLE_CONFIG} />
        </DataViewContext.Provider>
      </EuiFlexItem>
    </>
  );
};

EntityTabContent.displayName = 'EntityTabContent';

// eslint-disable-next-line import/no-default-export
export default EntityTabContent;
