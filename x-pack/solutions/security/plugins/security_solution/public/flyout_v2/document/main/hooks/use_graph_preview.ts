/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import {
  type EuidSourceFields,
  GRAPH_ACTOR_ENTITY_FIELDS,
  GRAPH_TARGET_ENTITY_FIELDS,
  getGraphActorEuidSourceFields,
  getGraphTargetEuidSourceFields,
  isGraphSupportedRuntimeMappingsIntegration,
} from '@kbn/cloud-security-posture-common';
import { ALL_ENTITY_TYPES, useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { getField, getFieldArray } from '../../../../flyout/document_details/shared/utils';
import { useHasGraphVisualizationLicense } from '../../../../common/hooks/use_has_graph_visualization_license';
import { useIsEntityStoreV2Available } from '../../../../flyout/shared/hooks/use_is_entity_store_v2_available';
import { useEntityStoreStatus } from '../../../../entity_analytics/components/entity_store/hooks/use_entity_store';

export interface UseGraphPreviewParams {
  /**
   * DataTableRecord of the document
   */
  hit: DataTableRecord;
}

/**
 * Interface for the result of the useGraphPreview hook
 */
export interface UseGraphPreviewResult {
  /**
   * The timestamp of the event
   */
  timestamp: string | null;

  /**
   * Array of event IDs associated with the alert
   */
  eventIds: string[];

  /**
   * Action associated with the event
   */
  action?: string[];

  /**
   * Boolean indicating if graph visualization is fully available
   * Combines: data availability + valid license + entity store running
   */
  shouldShowGraph: boolean;

  /**
   * Boolean indicating if the event has all required data fields for graph visualization
   */
  hasGraphData: boolean;
}

const hasEuidIdentity = (
  fieldsByType: EuidSourceFields,
  flattened: DataTableRecord['flattened']
): boolean =>
  ALL_ENTITY_TYPES.some((type) =>
    fieldsByType[type].some((field) => getFieldArray(flattened[field]).length > 0)
  );

/**
 * Derives graph preview parameters from a `DataTableRecord`. Used by the Flyout v2
 * graph preview and by legacy expandable-flyout graph surfaces (which build a `hit`
 * from their document context).
 */
export const useGraphPreview = ({ hit }: UseGraphPreviewParams): UseGraphPreviewResult => {
  const getFieldsData = (field: string) => hit.flattened[field];

  const timestamp = getField(getFieldsData('@timestamp'));
  const dataset = getField(getFieldsData('event.dataset'));

  const isSupportedRuntimeMappingsIntegration =
    dataset != null && isGraphSupportedRuntimeMappingsIntegration(dataset);

  const originalEventId = getFieldsData('kibana.alert.original_event.id');
  const eventId = getFieldsData('event.id');
  const eventIds = originalEventId ? getFieldArray(originalEventId) : getFieldArray(eventId);

  // `useEntityStoreEuidApi` is async-hydrated (see `entity_store/public/euid_api_context.tsx`);
  // it returns `null` until the lazy chunk loads. The `useMemo` recomputes once `euid` is available.
  const euid = useEntityStoreEuidApi()?.euid;

  // Actor and target detection covers both entity-store v1 (`*.entity.id` and `*.target.entity.id`,
  // still emitted in v2 backfill) and v2 raw identity fields (`host.id`, `host.name`, …) — the same
  // idiom used in `highlighted_fields.tsx` / `prevalence_details_view.tsx`. For targets, identity
  // fields are checked in their `.target.` namespace (e.g. `user.id` → `user.target.id`).
  const hasV1Actor = GRAPH_ACTOR_ENTITY_FIELDS.some(
    (field) => getFieldArray(hit.flattened[field]).length > 0
  );
  const hasV2Actor = useMemo(
    () => euid != null && hasEuidIdentity(getGraphActorEuidSourceFields(euid), hit.flattened),
    [euid, hit.flattened]
  );
  const hasActor = hasV1Actor || hasV2Actor;

  const hasV1Target = GRAPH_TARGET_ENTITY_FIELDS.some(
    (field) => getFieldArray(hit.flattened[field]).length > 0
  );
  const hasV2Target = useMemo(
    () => euid != null && hasEuidIdentity(getGraphTargetEuidSourceFields(euid), hit.flattened),
    [euid, hit.flattened]
  );
  const hasTarget = hasV1Target || hasV2Target;

  const actionField = getFieldsData('event.action');
  const action: string[] | undefined =
    actionField != null ? (getFieldArray(actionField) as string[]) : undefined;

  const hasGraphData =
    Boolean(timestamp) &&
    (isSupportedRuntimeMappingsIntegration ||
      (Boolean(action?.length) && eventIds.length > 0 && hasActor && hasTarget));

  const hasRequiredLicense = useHasGraphVisualizationLicense();
  // Entity-store availability is detected via two complementary signals because either may be
  // unavailable depending on session role: the `/status` endpoint 403s for the Serverless
  // "editor"/"viewer" roles, and the entities-index probe can miss recently-installed engines
  // when the latest index has not yet been created. OR'ing them keeps the graph visible in both
  // restricted-role test runs and admin sessions.
  const { data: entitiesIndexExists } = useIsEntityStoreV2Available();
  const { data: entityStoreStatus } = useEntityStoreStatus();
  const isEntityStoreAvailable =
    entitiesIndexExists?.indexExists === true || entityStoreStatus?.status === 'running';

  const shouldShowGraph = hasGraphData && hasRequiredLicense && isEntityStoreAvailable;

  return {
    timestamp,
    eventIds,
    action,
    shouldShowGraph,
    hasGraphData,
  };
};
