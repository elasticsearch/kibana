/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import {
  EuiButtonIcon,
  EuiPopover,
  EuiListGroup,
  EuiHorizontalRule,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { PopoverListItem } from '../../../../popovers/primitives/popover_list_item';
import {
  GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID,
  GROUPED_ITEM_ACTIONS_POPOVER_TEST_ID,
} from '../../../test_ids';
import type { EntityItem } from '../types';
import {
  getEntityExpandItems,
  fieldForRole,
} from '../../../../popovers/node_expand/get_entity_expand_items';
import type { EntityFilterActions } from '../../../../popovers/node_expand/get_entity_expand_items';
import {
  emitFilterToggle,
  emitIsOneOfFilterToggle,
  isFilterActiveForScope,
  emitEntityRelationshipToggle,
  isEntityRelationshipExpandedForScope,
  emitPinnedEuidToggle,
} from '../../../../filters/filter_store';
import { RELATED_ENTITY, RELATED_HOST, RELATED_USER } from '../../../../../common/constants';
import { useOpenEntityPreviewPanel } from '../../../hooks/use_open_entity_preview_panel';

const actionsButtonAriaLabel = i18n.translate(
  'securitySolutionPackages.csp.graph.groupedItem.actionsButton.ariaLabel',
  {
    defaultMessage: 'Actions',
  }
);

export interface EntityActionsButtonProps {
  item: EntityItem;
  /**
   * Unique identifier for the graph instance, used to scope filter state.
   */
  scopeId: string;
  /**
   * Whether this entity is the initial/origin entity of the graph investigation.
   * When true, "hide entity relationships" is disabled because the origin entity's
   * relationships are always shown and cannot be hidden from the grouped panel.
   */
  isInitialEntity?: boolean;
}

/**
 * Actions button for entity items in the grouped node preview panel.
 * Shows a popover with filter toggle actions and entity details option.
 * Uses FilterStore (scoped by scopeId) for filter state management.
 * Uses useExpandableFlyoutApi to open entity details preview panel.
 */
export const EntityActionsButton = ({
  item,
  scopeId,
  isInitialEntity = false,
}: EntityActionsButtonProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const closePopover = useCallback(() => setIsPopoverOpen(false), []);
  const togglePopover = useCallback(() => setIsPopoverOpen((prev) => !prev), []);

  const openEntityPreviewPanel = useOpenEntityPreviewPanel();
  const sourceFields = (item.entity.sourceFields ?? {}) as Record<string, string | string[]>;
  const engineType = item.entity.engine_type;

  const getRelatedFieldAndValues = ():
    | { field: typeof RELATED_USER | typeof RELATED_HOST | typeof RELATED_ENTITY; values: string[] }
    | undefined => {
    if (engineType === 'user') {
      const values = Object.entries(sourceFields)
        .filter(([field]) => field.startsWith('user.'))
        .flatMap(([, value]) => ([] as string[]).concat(value));
      return { field: RELATED_USER, values };
    }
    if (engineType === 'host') {
      const values = Object.entries(sourceFields)
        .filter(([field]) => field.startsWith('host.'))
        .flatMap(([, value]) => ([] as string[]).concat(value));
      return { field: RELATED_HOST, values };
    }
    const entityFieldValues = Object.entries(sourceFields)
      .filter(([field]) => field.startsWith('entity.'))
      .flatMap(([, value]) => ([] as string[]).concat(value));
    // Include item.id for backward compatibility with older data that may not have entity.* fields
    const values = entityFieldValues.includes(item.id)
      ? entityFieldValues
      : [...entityFieldValues, item.id];
    return { field: RELATED_ENTITY, values };
  };

  const entityFilterActions: EntityFilterActions = {
    toggleEntityFilter: (role, action) => {
      for (const [field, value] of Object.entries(sourceFields)) {
        // Flatten string | string[] to string[] so each value gets its own OR'd phrase filter
        for (const v of ([] as string[]).concat(value)) {
          emitFilterToggle(scopeId, fieldForRole(field, role), v, action);
        }
      }
      if (action === 'show') {
        emitPinnedEuidToggle(scopeId, item.id, 'show');
      } else {
        // Only unpin when no entity filters remain active for either role
        const hasRemainingFilters = (['actor', 'target'] as const).some((r) =>
          Object.entries(sourceFields).some(([field, value]) =>
            ([] as string[])
              .concat(value)
              .some((v) => isFilterActiveForScope(scopeId, fieldForRole(field, r), v))
          )
        );
        if (!hasRemainingFilters) {
          emitPinnedEuidToggle(scopeId, item.id, 'hide');
        }
      }
    },
    isEntityFilterActive: (role) =>
      Object.entries(sourceFields).some(([field, value]) =>
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

  // Generate items fresh on each render to reflect current filter state
  const items = getEntityExpandItems({
    nodeId: item.id,
    entityFilterActions,
    onShowEntityDetails: () => openEntityPreviewPanel(item.id, scopeId, item.entity),
    onClose: closePopover,
    shouldRender: {
      showEntityRelationships: true,
      showActionsByEntity: true,
      showActionsOnEntity: true,
      showRelatedEvents: true,
      showEntityDetails: true,
    },
    showEntityDetailsDisabled: !item.entity.availableInEntityStore,
    isEntityRelationshipsExpanded: isEntityRelationshipExpandedForScope(scopeId, item.id),
    toggleEntityRelationships: (action) => {
      emitEntityRelationshipToggle(scopeId, item.id, action);
      // Pin the entity when showing relationships so it appears as a solo node
      // rather than merging back into its type-group. Unpin when hiding.
      emitPinnedEuidToggle(scopeId, item.id, action);
    },
    showEntityRelationshipsDisabled: !item.entity.availableInEntityStore || isInitialEntity,
  });

  return (
    <EuiPopover
      aria-label={actionsButtonAriaLabel}
      button={
        <EuiToolTip content={actionsButtonAriaLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="boxesHorizontal"
            aria-label={actionsButtonAriaLabel}
            color="text"
            onClick={togglePopover}
            data-test-subj={GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID}
          />
        </EuiToolTip>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="rightCenter"
      data-test-subj={GROUPED_ITEM_ACTIONS_POPOVER_TEST_ID}
    >
      <EuiListGroup bordered={false}>
        {items.map((popoverItem, index) => {
          if (popoverItem.type === 'separator') {
            return <EuiHorizontalRule key={index} margin="none" size="full" />;
          }
          return (
            <PopoverListItem
              key={index}
              iconType={popoverItem.iconType}
              label={popoverItem.label}
              onClick={popoverItem.onClick}
              disabled={popoverItem.disabled}
              data-test-subj={popoverItem.testSubject}
              showToolTip={popoverItem.showToolTip}
              toolTipText={popoverItem.toolTipText}
              toolTipProps={popoverItem.toolTipProps}
            />
          );
        })}
      </EuiListGroup>
    </EuiPopover>
  );
};
