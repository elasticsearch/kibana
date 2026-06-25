/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import { useNodeExpandPopover } from './use_node_expand_popover';
import type { NodeProps, NodeViewModel } from '../../types';
import { GRAPH_NODE_EXPAND_POPOVER_TEST_ID } from '../../test_ids';
import {
  getEntityExpandItems,
  getSourceFieldsFromNode,
  fieldForRole,
} from './get_entity_expand_items';
import type { EntityFilterActions } from './get_entity_expand_items';
import { getNodeDocumentMode, isEntityNodeEnriched } from '../../utils';
import {
  emitFilterToggle,
  emitIsOneOfFilterToggle,
  isFilterActiveForScope,
  emitEntityRelationshipToggle,
  isEntityRelationshipExpandedForScope,
  isInitialEntityForScope,
  emitPinnedEuidToggle,
} from '../../filters/filter_store';
import { RELATED_ENTITY, RELATED_HOST, RELATED_USER } from '../../../common/constants';

/**
 * Hook to handle the entity node expand popover.
 * This hook is used to show the popover when the user clicks on the expand button of an entity node.
 * The popover contains the actions to show/hide the actions by entity, actions on entity, and related entities.
 *
 * Uses graph entity filter event bus for actor/target filter state.
 * Uses filter event bus for related events (pinning via RELATED_ENTITY).
 * Uses entity relationship event bus for relationship state.
 *
 * @param scopeId - The unique identifier for the graph instance (used to scope filter state)
 * @param onOpenEventPreview - Optional callback to open event preview with full node data.
 *                             If provided, clicking "Show entity details" calls this callback.
 * @returns The entity node expand popover.
 */
export const useEntityNodeExpandPopover = (
  scopeId: string,
  onOpenEventPreview?: (node: NodeViewModel) => void
) => {
  const itemsFn = useCallback(
    (node: NodeProps) => {
      const docMode = getNodeDocumentMode(node.data);
      const isSingleEntity = docMode === 'single-entity';
      const isGroupedEntities = docMode === 'grouped-entities';
      const isEnriched = isEntityNodeEnriched(node.data);
      const isInitialEntity = isInitialEntityForScope(scopeId, node.id);

      const sourceFields = getSourceFieldsFromNode(node.data);

      const engineType =
        'documentsData' in node.data &&
        Array.isArray(node.data.documentsData) &&
        node.data.documentsData.length > 0
          ? (
              node.data.documentsData[0] as {
                entity?: { engine_type?: string };
              }
            ).entity?.engine_type
          : undefined;

      const getRelatedFieldAndValues = ():
        | {
            field: typeof RELATED_USER | typeof RELATED_HOST | typeof RELATED_ENTITY;
            values: string[];
          }
        | undefined => {
        if (engineType === 'user') {
          const values = Object.entries(sourceFields ?? {})
            .filter(([field]) => field.startsWith('user.'))
            .flatMap(([, value]) => ([] as string[]).concat(value));
          return { field: RELATED_USER, values };
        }
        if (engineType === 'host') {
          const values = Object.entries(sourceFields ?? {})
            .filter(([field]) => field.startsWith('host.'))
            .flatMap(([, value]) => ([] as string[]).concat(value));
          return { field: RELATED_HOST, values };
        }
        const entityFieldValues = Object.entries(sourceFields ?? {})
          .filter(([field]) => field.startsWith('entity.'))
          .flatMap(([, value]) => ([] as string[]).concat(value));
        // Include node.id for backward compatibility with older data that may not have entity.* fields
        const values = entityFieldValues.includes(node.id)
          ? entityFieldValues
          : [...entityFieldValues, node.id];
        return { field: RELATED_ENTITY, values };
      };

      const entityFilterActions: EntityFilterActions = {
        toggleEntityFilter: (role, action) => {
          for (const [field, value] of Object.entries(sourceFields ?? {})) {
            // Flatten string | string[] to string[] so each value gets its own OR'd phrase filter
            for (const v of ([] as string[]).concat(value)) {
              emitFilterToggle(scopeId, fieldForRole(field, role), v, action);
            }
          }
          if (action === 'show') {
            emitPinnedEuidToggle(scopeId, node.id, 'show');
          } else {
            // Only unpin when no entity filters remain active for either role
            const hasRemainingFilters = (['actor', 'target'] as const).some((r) =>
              Object.entries(sourceFields ?? {}).some(([field, value]) =>
                ([] as string[])
                  .concat(value)
                  .some((v) => isFilterActiveForScope(scopeId, fieldForRole(field, r), v))
              )
            );
            if (!hasRemainingFilters) {
              emitPinnedEuidToggle(scopeId, node.id, 'hide');
            }
          }
        },
        isEntityFilterActive: (role) =>
          Object.entries(sourceFields ?? {}).some(([field, value]) =>
            ([] as string[])
              .concat(value)
              .some((v) => isFilterActiveForScope(scopeId, fieldForRole(field, role), v))
          ),
        toggleRelatedEvents: (action) => {
          const related = getRelatedFieldAndValues();
          if (!related) return;
          if (related.values.length === 1) {
            emitFilterToggle(scopeId, related.field, related.values[0], action);
          } else if (related.values.length > 1) {
            emitIsOneOfFilterToggle(scopeId, related.field, related.values, action);
          }
        },
        isRelatedEventsActive: () => {
          const related = getRelatedFieldAndValues();
          if (!related) return false;
          return isFilterActiveForScope(scopeId, related.field, related.values);
        },
      };

      return getEntityExpandItems({
        nodeId: node.id,
        entityFilterActions,
        onShowEntityDetails: onOpenEventPreview ? () => onOpenEventPreview(node.data) : undefined,
        shouldRender: {
          // Entity relationships only for single-entity mode when full feature set is active
          showEntityRelationships: isSingleEntity && onOpenEventPreview !== undefined,
          // Filter actions only for single-entity mode
          showActionsByEntity: isSingleEntity,
          showActionsOnEntity: isSingleEntity,
          showRelatedEvents: isSingleEntity,
          // Entity details for both single and grouped, when handler available
          showEntityDetails:
            (isSingleEntity || isGroupedEntities) && onOpenEventPreview !== undefined,
        },
        isEntityRelationshipsExpanded: isEntityRelationshipExpandedForScope(scopeId, node.id),
        isInitialEntity,
        toggleEntityRelationships: (action) => {
          emitEntityRelationshipToggle(scopeId, node.id, action);
          emitPinnedEuidToggle(scopeId, node.id, action);
        },
        showEntityRelationshipsDisabled: !isEnriched || isInitialEntity,
        showEntityDetailsDisabled: isSingleEntity && !isEnriched,
      });
    },
    [scopeId, onOpenEventPreview]
  );

  return useNodeExpandPopover({
    id: 'entity-node-expand-popover',
    itemsFn,
    testSubject: GRAPH_NODE_EXPAND_POPOVER_TEST_ID,
  });
};
