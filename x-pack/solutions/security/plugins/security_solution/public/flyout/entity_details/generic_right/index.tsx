/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useEffect, useMemo } from 'react';
import type { FlyoutPanelProps } from '@kbn/expandable-flyout';
import { METRIC_TYPE } from '@kbn/analytics';
import {
  GENERIC_ENTITY_FLYOUT_OPENED,
  uiMetricService,
} from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import { EuiEmptyPrompt, EuiLoadingSpinner } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { buildEntityNameFilter } from '../../../../common/search_strategy';
import { FIRST_RECORD_PAGINATION } from '../../../entity_analytics/common';
import { useRiskScore } from '../../../entity_analytics/api/hooks/use_risk_score';
import { useRefetchQueryById } from '../../../entity_analytics/api/hooks/use_refetch_query_by_id';
import { useCalculateEntityRiskScore } from '../../../entity_analytics/api/hooks/use_calculate_entity_risk_score';
import { EntityIdentifierFields, EntityType } from '../../../../common/entity_analytics/types';
import type { Refetch } from '../../../common/types';
import {
  EntityDetailsLeftPanelTab,
  type EntityDetailsPath,
} from '../shared/components/left_panel/left_panel_header';
import { useOpenGenericEntityDetailsLeftPanel } from './hooks/use_open_generic_entity_details_left_panel';
import {
  useGetGenericEntity,
  type UseGetGenericEntityParams,
} from './hooks/use_get_generic_entity';
import { FlyoutNavigation } from '../../shared/components/flyout_navigation';
import { useGenericEntityCriticality } from './hooks/use_generic_entity_criticality';
import { GenericEntityFlyoutHeader } from './header';
import { GenericEntityFlyoutContent } from './content';
import { GenericEntityFlyoutFooter } from './footer';
import { RISK_INPUTS_TAB_QUERY_ID } from '../../../entity_analytics/components/entity_details_flyout/tabs/risk_inputs/risk_inputs_tab';

interface CommonError {
  body: {
    error: string;
    message: string;
    statusCode: number;
  };
}

export const isCommonError = (error: unknown): error is CommonError => {
  // @ts-ignore TS2339: Property body does not exist on type {}
  if (!error?.body || !error?.body?.error || !error?.body?.message || !error?.body?.statusCode) {
    return false;
  }

  return true;
};

interface BaseGenericEntityPanelProps {
  scopeId: string;
  isPreviewMode?: boolean;
  /** this is because FlyoutPanelProps defined params as Record<string, unknown> {@link FlyoutPanelProps#params} */
  [key: string]: unknown;
  isEngineMetadataExist?: boolean;
}

export type GenericEntityPanelProps = BaseGenericEntityPanelProps & UseGetGenericEntityParams;

export interface GenericEntityPanelExpandableFlyoutProps extends FlyoutPanelProps {
  key: 'generic-entity-panel';
  params: GenericEntityPanelProps;
}

export const GenericEntityPanel = memo(function GenericEntityPanel(
  params: GenericEntityPanelProps
) {
  const { isPreviewMode, scopeId, isEngineMetadataExist } = params;

  // When you destructuring params in the function signature TypeScript loses track
  // of the union type constraints and infers them as potentially undefined
  const { getGenericEntity } = useGetGenericEntity(params);
  const genericInsightsValue = getGenericEntity.data?._source?.entity.id;
  const identityFields = useMemo(
    () => ({ 'related.entity': genericInsightsValue || '' }),
    [genericInsightsValue]
  );
  const { getAssetCriticality } = useGenericEntityCriticality({
    enabled: !!genericInsightsValue,
    idField: EntityIdentifierFields.generic,
    // @ts-ignore since this query is only enabled when the entity.id exists, we can safely assume that idValue won't be undefined
    idValue: genericInsightsValue,
  });

  const { openGenericEntityDetails } = useOpenGenericEntityDetailsLeftPanel({
    identityFields,
    ...params,
  });

  const openGenericEntityDetailsPanelByPath = (path: EntityDetailsPath) => {
    return openGenericEntityDetails(path);
  };

  const genericNameFilterQuery = useMemo(
    () =>
      genericInsightsValue
        ? buildEntityNameFilter(EntityType.generic, [genericInsightsValue])
        : undefined,
    [genericInsightsValue]
  );

  const riskScoreState = useRiskScore({
    riskEntity: EntityType.generic,
    filterQuery: genericNameFilterQuery,
    onlyLatest: false,
    pagination: FIRST_RECORD_PAGINATION,
  });

  const { refetch } = riskScoreState;

  const refetchRiskInputsTab = useRefetchQueryById(RISK_INPUTS_TAB_QUERY_ID);

  const refetchRiskScore = useCallback(() => {
    refetch();
    (refetchRiskInputsTab as Refetch | null)?.();
  }, [refetch, refetchRiskInputsTab]);

  const { calculateEntityRiskScore } = useCalculateEntityRiskScore({
    identifierType: EntityType.generic,
    identifier: genericInsightsValue || '',
    entityId: genericInsightsValue || undefined,
    onSuccess: refetchRiskScore,
  });

  useEffect(() => {
    if (getGenericEntity.data?._id) {
      uiMetricService.trackUiMetric(METRIC_TYPE.COUNT, GENERIC_ENTITY_FLYOUT_OPENED);
    }
  }, [getGenericEntity.data?._id]);

  if (!isEngineMetadataExist) {
    return (
      <>
        <EuiEmptyPrompt
          color="danger"
          iconType="warning"
          data-test-subj="generic-right-flyout-error-prompt-missing-engineMetadataType"
          title={
            <h2>
              <FormattedMessage
                id="xpack.securitySolution.genericEntityFlyout.missingEngineMetadataType.errorTitle"
                defaultMessage="Unable to load entity: 'EngineMetadata.Type' is missing or not set."
              />
            </h2>
          }
        />
      </>
    );
  }

  if (getGenericEntity.isLoading || getAssetCriticality.isLoading) {
    return (
      <>
        <EuiLoadingSpinner
          size="xxl"
          css={{ position: 'absolute', inset: '50%' }}
          data-test-subj="generic-flyout-loading"
        />
      </>
    );
  }

  if (!getGenericEntity.data?._source || getGenericEntity.isError) {
    return (
      <>
        <EuiEmptyPrompt
          color="danger"
          iconType="warning"
          data-test-subj="generic-right-flyout-error-prompt"
          title={
            <h2>
              <FormattedMessage
                id="xpack.securitySolution.genericEntityFlyout.errorTitle"
                defaultMessage="Unable to load entity"
              />
            </h2>
          }
          body={
            isCommonError(getGenericEntity.error) ? (
              <p>
                <FormattedMessage
                  id="xpack.securitySolution.genericEntityFlyout.errorBody"
                  defaultMessage="{error} {statusCode}: {body}"
                  values={{
                    error: getGenericEntity.error.body.error,
                    statusCode: getGenericEntity.error.body.statusCode,
                    body: getGenericEntity.error.body.message,
                  }}
                />
              </p>
            ) : undefined
          }
        />
      </>
    );
  }

  const source = getGenericEntity.data._source;
  const entity = getGenericEntity.data._source.entity;
  const fields = getGenericEntity.data.fields || {};
  const assetCriticalityLevel = getAssetCriticality.data?.criticality_level;

  return (
    <>
      <FlyoutNavigation
        flyoutIsExpandable={true}
        expandDetails={() =>
          openGenericEntityDetailsPanelByPath({ tab: EntityDetailsLeftPanelTab.FIELDS_TABLE })
        }
        isPreviewMode={isPreviewMode}
      />
      <GenericEntityFlyoutHeader entity={entity} source={source} />
      <GenericEntityFlyoutContent
        source={source}
        openGenericEntityDetailsPanelByPath={openGenericEntityDetailsPanelByPath}
        identityFields={identityFields}
        onAssetCriticalityChange={calculateEntityRiskScore}
      />
      <GenericEntityFlyoutFooter
        scopeId={scopeId}
        isPreviewMode={isPreviewMode ?? false}
        entityId={entity.id}
        entityFields={fields}
        assetCriticalityLevel={assetCriticalityLevel}
      />
    </>
  );
});

GenericEntityPanel.displayName = 'GenericEntityPanel';
