/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useEntityNodeExpandPopover } from './use_entity_node_expand_popover';
import type { NodeProps } from '../../types';
import type {
  ItemExpandPopoverListItemProps,
  SeparatorExpandPopoverListItemProps,
} from '../primitives/list_graph_popover';
import {
  GRAPH_NODE_POPOVER_SHOW_ACTIONS_BY_ITEM_ID,
  GRAPH_NODE_POPOVER_SHOW_ACTIONS_ON_ITEM_ID,
  GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID,
  GRAPH_NODE_POPOVER_SHOW_ENTITY_DETAILS_ITEM_ID,
  GRAPH_NODE_POPOVER_SHOW_GROUPED_ENTITIES_ITEM_ID,
  GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID,
  GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_TOOLTIP_ID,
} from '../../test_ids';
import {
  emitFilterToggle,
  emitIsOneOfFilterToggle,
  isFilterActiveForScope,
  isEntityRelationshipExpandedForScope,
  emitEntityRelationshipToggle,
  emitPinnedEuidToggle,
} from '../../filters/filter_store';
import { RELATED_ENTITY, RELATED_HOST, RELATED_USER } from '../../../common/constants';

// Mock filter_store module
jest.mock('../../filters/filter_store', () => {
  const actual = jest.requireActual('../../filters/filter_store');
  return {
    ...actual,
    isFilterActiveForScope: jest.fn(() => false),
    isEntityRelationshipExpandedForScope: jest.fn(() => false),
    emitFilterToggle: jest.fn(),
    emitIsOneOfFilterToggle: jest.fn(),
    emitEntityRelationshipToggle: jest.fn(),
    emitPinnedEuidToggle: jest.fn(),
  };
});

const mockIsFilterActiveForScope = isFilterActiveForScope as jest.MockedFunction<
  typeof isFilterActiveForScope
>;
const mockIsEntityRelationshipExpandedForScope =
  isEntityRelationshipExpandedForScope as jest.MockedFunction<
    typeof isEntityRelationshipExpandedForScope
  >;
const mockEmitFilterToggle = emitFilterToggle as jest.MockedFunction<typeof emitFilterToggle>;
const mockEmitIsOneOfFilterToggle = emitIsOneOfFilterToggle as jest.MockedFunction<
  typeof emitIsOneOfFilterToggle
>;
const mockEmitEntityRelationshipToggle = emitEntityRelationshipToggle as jest.MockedFunction<
  typeof emitEntityRelationshipToggle
>;
const mockEmitPinnedEuidToggle = emitPinnedEuidToggle as jest.MockedFunction<
  typeof emitPinnedEuidToggle
>;

// Mock useNodeExpandGraphPopover to capture and expose itemsFn
let capturedItemsFn:
  | ((
      node: NodeProps
    ) => Array<ItemExpandPopoverListItemProps | SeparatorExpandPopoverListItemProps>)
  | null = null;

jest.mock('./use_node_expand_popover', () => ({
  useNodeExpandPopover: jest.fn(({ itemsFn }) => {
    capturedItemsFn = itemsFn;
    return {
      id: 'test-popover',
      onNodeExpandButtonClick: jest.fn(),
      PopoverComponent: () => null,
      actions: { openPopover: jest.fn(), closePopover: jest.fn() },
      state: { isOpen: false, anchorElement: null },
    };
  }),
}));

const createMockNode = (
  docMode: 'single-entity' | 'grouped-entities',
  hasEntityEnrichment: boolean = true,
  engineType?: 'user' | 'host' | 'service' | 'generic'
): NodeProps => {
  const baseNode = {
    id: 'test-node-id',
    type: 'entity',
    position: { x: 0, y: 0 },
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: true,
    selected: false,
    draggable: true,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    data: {
      id: 'entity-123',
      color: 'primary' as const,
      shape: 'ellipse' as const,
      label: 'Test Entity',
    },
  } as NodeProps;

  if (docMode === 'single-entity') {
    const docData: Record<string, unknown> = {
      id: 'entity-123',
      type: 'entity' as const,
      entity: {
        availableInEntityStore: hasEntityEnrichment,
        engine_type: engineType,
        sourceFields: {
          'user.id': 'test-user',
          'user.email': 'test@example.com',
          'entity.id': 'entity-abc',
        },
      },
    };

    // Only add enrichment fields if hasEntityEnrichment is true
    if (hasEntityEnrichment && docData.entity) {
      (docData.entity as Record<string, unknown>).name = 'Test Entity';
      (docData.entity as Record<string, unknown>).type = 'User';
    }

    return {
      ...baseNode,
      data: {
        ...baseNode.data,
        documentsData: [docData],
      },
    } as NodeProps;
  }

  if (docMode === 'grouped-entities') {
    const createDocData = (id: string): Record<string, unknown> => {
      const docData: Record<string, unknown> = {
        id,
        type: 'entity' as const,
        entity: {
          availableInEntityStore: hasEntityEnrichment,
          engine_type: engineType,
          sourceFields: { 'host.id': id },
        },
      };

      if (hasEntityEnrichment && docData.entity) {
        (docData.entity as Record<string, unknown>).name = 'Test Entity';
        (docData.entity as Record<string, unknown>).type = 'User';
      }

      return docData;
    };

    return {
      ...baseNode,
      data: {
        ...baseNode.data,
        documentsData: [createDocData('entity-123'), createDocData('entity-456')],
        count: 2,
      },
    } as NodeProps;
  }

  // na mode - node without documentsData
  return baseNode;
};

describe('useEntityNodeExpandPopover', () => {
  const scopeId = 'test-scope-id';
  const mockOnOpenEventPreview = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    capturedItemsFn = null;
    mockEmitFilterToggle.mockClear();
    mockEmitIsOneOfFilterToggle.mockClear();
    mockEmitEntityRelationshipToggle.mockClear();
    mockEmitPinnedEuidToggle.mockClear();
    mockIsFilterActiveForScope.mockReturnValue(false);
    mockIsEntityRelationshipExpandedForScope.mockReturnValue(false);
  });

  describe('itemsFn - single-entity mode', () => {
    it('should return all 4 menu items when docMode is single-entity and entity is enriched', () => {
      const node = createMockNode('single-entity');
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      // 6 items: entity relationships, actions by, actions on, related, separator, entity details
      expect(items).toHaveLength(6);
      expect(items[0]).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID,
      });
      expect(items[1]).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_ACTIONS_BY_ITEM_ID,
      });
      expect(items[2]).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_ACTIONS_ON_ITEM_ID,
      });
      expect(items[3]).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID,
      });
      expect(items[4]).toMatchObject({
        type: 'separator',
      });
      expect(items[5]).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_ENTITY_DETAILS_ITEM_ID,
        label: 'Show entity details',
        disabled: false,
      });
    });

    it('should return only filter items when onOpenEventPreview is not provided', () => {
      const node = createMockNode('single-entity');
      renderHook(() => useEntityNodeExpandPopover(scopeId));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      // Only filter items, no separator or entity details
      expect(items).toHaveLength(3);
      expect(items[0]).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_ACTIONS_BY_ITEM_ID,
      });
      expect(items[1]).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_ACTIONS_ON_ITEM_ID,
      });
      expect(items[2]).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID,
      });
    });
  });

  describe('itemsFn - grouped-entities mode', () => {
    it('should return only entity details item when docMode is grouped-entities and onOpenEventPreview provided', () => {
      const node = createMockNode('grouped-entities');
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      // grouped-entities mode only shows entity details (no filter items)
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_GROUPED_ENTITIES_ITEM_ID,
        label: 'Show grouped entities',
        disabled: false,
      });
    });

    it('should return empty array when docMode is grouped-entities and onOpenEventPreview not provided', () => {
      const node = createMockNode('grouped-entities');
      renderHook(() => useEntityNodeExpandPopover(scopeId));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      // No filter items in grouped mode, no entity details without callback
      expect(items).toHaveLength(0);
    });

    it('should not show filter actions in grouped-entities mode', () => {
      const node = createMockNode('grouped-entities');
      renderHook(() => useEntityNodeExpandPopover(scopeId));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const hasActionsBy = items.some(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_ACTIONS_BY_ITEM_ID
      );
      const hasActionsOn = items.some(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_ACTIONS_ON_ITEM_ID
      );
      const hasRelated = items.some(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID
      );

      expect(hasActionsBy).toBe(false);
      expect(hasActionsOn).toBe(false);
      expect(hasRelated).toBe(false);
    });
  });

  describe('shouldDisableEntityDetailsListItem', () => {
    it('should disable entity details when entity is not enriched in single-entity mode', () => {
      const node = createMockNode('single-entity', false);
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);
      const entityDetailsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_DETAILS_ITEM_ID
      );

      expect(entityDetailsItem).toMatchObject({
        disabled: true,
        showToolTip: true,
      });
    });

    it('should enable entity details when entity is enriched in single-entity mode', () => {
      const node = createMockNode('single-entity', true);
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);
      const entityDetailsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_DETAILS_ITEM_ID
      );

      expect(entityDetailsItem).toMatchObject({
        disabled: false,
      });
    });

    it('should disable entity details when documentsData does not contain entity enrichment', () => {
      const node = createMockNode('single-entity', false);
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const entityDetailsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_DETAILS_ITEM_ID
      );

      expect(entityDetailsItem).toMatchObject({
        disabled: true,
        showToolTip: true,
      });
    });

    it('should also disable entity details in grouped-entities mode when documentsData does not contain entity enrichment', () => {
      const node = createMockNode('grouped-entities', false);
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      // In grouped-entities mode, only entity details is shown (no filter items)
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_GROUPED_ENTITIES_ITEM_ID,
        disabled: false, // Not disabled - grouped mode doesn't check enrichment
      });
    });
  });

  describe('action labels', () => {
    it('should show "Show" labels when filters are not active', () => {
      const node = createMockNode('single-entity');
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const actionsByItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_ACTIONS_BY_ITEM_ID
      );
      const actionsOnItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_ACTIONS_ON_ITEM_ID
      );
      const relatedItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID
      );

      if (actionsByItem?.type === 'item') {
        expect(actionsByItem.label).toContain('Show');
      }
      if (actionsOnItem?.type === 'item') {
        expect(actionsOnItem.label).toContain('Show');
      }
      if (relatedItem?.type === 'item') {
        expect(relatedItem.label).toContain('Show');
      }
    });

    it('should show "Hide" labels when filters are active', () => {
      // Mock all filter checks as active (actor/target sourceFields + related events)
      mockIsFilterActiveForScope.mockReturnValue(true);

      const node = createMockNode('single-entity');
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const actionsByItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_ACTIONS_BY_ITEM_ID
      );

      if (actionsByItem?.type === 'item') {
        expect(actionsByItem.label).toContain('Hide');
      }
    });
  });

  describe('filter action via event bus', () => {
    it('should emit filter toggle event when filter item is clicked', () => {
      const node = createMockNode('single-entity');
      renderHook(() => useEntityNodeExpandPopover(scopeId));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relatedItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID
      );

      if (relatedItem?.type === 'item' && relatedItem.onClick) {
        relatedItem.onClick();
      }

      // The mock node id has no EUID prefix, so it resolves to the generic type and filters on
      // its single entity.* value — a lone value emits a phrase filter, not an isOneOf.
      expect(mockEmitFilterToggle).toHaveBeenCalledWith(
        scopeId,
        expect.any(String),
        'entity-abc',
        'show'
      );
    });

    it('should emit pinned EUID toggle when "actions by" filter item is clicked', () => {
      const node = createMockNode('single-entity');
      renderHook(() => useEntityNodeExpandPopover(scopeId));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const actionsByItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_ACTIONS_BY_ITEM_ID
      );

      if (actionsByItem?.type === 'item' && actionsByItem.onClick) {
        actionsByItem.onClick();
      }

      expect(mockEmitPinnedEuidToggle).toHaveBeenCalledWith(scopeId, node.id, 'show');
    });

    it('should emit pinned EUID hide when hiding the last entity filter', () => {
      // Before toggle: return true so button says "Hide"
      // After emitFilterToggle calls: return false (no remaining filters)
      let afterToggle = false;
      mockEmitFilterToggle.mockImplementation(() => {
        afterToggle = true;
      });
      mockIsFilterActiveForScope.mockImplementation(() => !afterToggle);

      const node = createMockNode('single-entity');
      renderHook(() => useEntityNodeExpandPopover(scopeId));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const actionsByItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_ACTIONS_BY_ITEM_ID
      );

      if (actionsByItem?.type === 'item' && actionsByItem.onClick) {
        actionsByItem.onClick();
      }

      expect(mockEmitPinnedEuidToggle).toHaveBeenCalledWith(scopeId, node.id, 'hide');
    });

    it('should not emit pinned EUID hide when other entity filters remain active', () => {
      // All filter checks return true (both roles have active filters)
      mockIsFilterActiveForScope.mockReturnValue(true);

      const node = createMockNode('single-entity');
      renderHook(() => useEntityNodeExpandPopover(scopeId));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const actionsByItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_ACTIONS_BY_ITEM_ID
      );

      if (actionsByItem?.type === 'item' && actionsByItem.onClick) {
        actionsByItem.onClick();
      }

      // Should NOT unpin because other role filters are still active
      expect(mockEmitPinnedEuidToggle).not.toHaveBeenCalledWith(scopeId, node.id, 'hide');
    });

    it('should emit RELATED_USER with user.* source field values when engine_type is user', () => {
      const node = createMockNode('single-entity', true, 'user');
      renderHook(() => useEntityNodeExpandPopover(scopeId));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relatedItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID
      );

      if (relatedItem?.type === 'item' && relatedItem.onClick) {
        relatedItem.onClick();
      }

      // Multiple values → emitIsOneOfFilterToggle with the full array
      expect(mockEmitIsOneOfFilterToggle).toHaveBeenCalledWith(
        scopeId,
        RELATED_USER,
        ['test-user', 'test@example.com'],
        'show'
      );
      expect(mockEmitFilterToggle).not.toHaveBeenCalledWith(
        scopeId,
        RELATED_ENTITY,
        expect.anything(),
        expect.anything()
      );
    });

    it('should check RELATED_USER with user.* source field values for isRelatedEventsActive when engine_type is user', () => {
      mockIsFilterActiveForScope.mockImplementation(
        (_, field, value) =>
          field === RELATED_USER && Array.isArray(value) && value.includes('test-user')
      );

      const node = createMockNode('single-entity', true, 'user');
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relatedItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID
      );

      // Filter is active for user, so the label should say "Hide"
      if (relatedItem?.type === 'item') {
        expect(relatedItem.label).toContain('Hide');
      }
    });

    it('should emit RELATED_HOST via isOneOf with host.* source field values when engine_type is host', () => {
      const customNode: NodeProps = {
        id: 'test-node-id',
        type: 'entity',
        position: { x: 0, y: 0 },
        dragging: false,
        zIndex: 0,
        selectable: true,
        deletable: true,
        selected: false,
        draggable: true,
        isConnectable: true,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
        data: {
          id: 'entity-123',
          color: 'primary' as const,
          shape: 'ellipse' as const,
          label: 'Test Entity',
          documentsData: [
            {
              id: 'entity-123',
              type: 'entity' as const,
              entity: {
                engine_type: 'host',
                availableInEntityStore: true,
                sourceFields: { 'host.name': 'server-1', 'host.id': 'host-abc' },
              },
            },
          ],
        },
      } as unknown as NodeProps;

      renderHook(() => useEntityNodeExpandPopover(scopeId));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(customNode);

      const relatedItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID
      );

      if (relatedItem?.type === 'item' && relatedItem.onClick) {
        relatedItem.onClick();
      }

      expect(mockEmitIsOneOfFilterToggle).toHaveBeenCalledWith(
        scopeId,
        RELATED_HOST,
        ['server-1', 'host-abc'],
        'show'
      );
      expect(mockEmitFilterToggle).not.toHaveBeenCalledWith(
        scopeId,
        RELATED_ENTITY,
        expect.anything(),
        expect.anything()
      );
    });

    it('should use RELATED_ENTITY with entity.* source field values, never the calculated EUID', () => {
      const node = createMockNode('single-entity', true);
      renderHook(() => useEntityNodeExpandPopover(scopeId));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relatedItem = items.find(
        (item) =>
          item.type === 'item' && item.testSubject === GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID
      );

      if (relatedItem?.type === 'item' && relatedItem.onClick) {
        relatedItem.onClick();
      }

      // Only the entity.* source field value. The node id ('test-node-id') is the calculated EUID,
      // which appears in no event field — including it produced a filter that matched nothing.
      expect(mockEmitFilterToggle).toHaveBeenCalledWith(
        scopeId,
        RELATED_ENTITY,
        'entity-abc',
        'show'
      );
      expect(mockEmitIsOneOfFilterToggle).not.toHaveBeenCalled();
    });

    it('should call onOpenEventPreview callback when entity details item is clicked', () => {
      const node = createMockNode('single-entity');

      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const entityDetailsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_DETAILS_ITEM_ID
      );

      if (entityDetailsItem?.type === 'item' && entityDetailsItem.onClick) {
        entityDetailsItem.onClick();
      }

      expect(mockOnOpenEventPreview).toHaveBeenCalledWith(node.data);
    });
  });

  describe('entity relationships', () => {
    it('should render "Show entity relationships" item for enriched single-entity node', () => {
      const node = createMockNode('single-entity', true);
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relationshipsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );

      expect(relationshipsItem).toBeDefined();
      expect(relationshipsItem).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID,
        disabled: false,
      });
      if (relationshipsItem?.type === 'item') {
        expect(relationshipsItem.label).toContain('Show entity relationships');
      }
    });

    it('should disable "Show entity relationships" when entity is not enriched', () => {
      const node = createMockNode('single-entity', false);
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relationshipsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );

      expect(relationshipsItem).toMatchObject({
        type: 'item',
        testSubject: GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID,
        disabled: true,
        showToolTip: true,
      });
      if (relationshipsItem?.type === 'item') {
        expect(relationshipsItem.toolTipText).toBe('Entity relationships not available');
        expect(relationshipsItem.toolTipProps).toMatchObject({
          position: 'bottom',
          'data-test-subj': GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_TOOLTIP_ID,
        });
      }
    });

    it('should show "Hide entity relationships" when entity is expanded in the event bus', () => {
      const node = createMockNode('single-entity', true);
      mockIsEntityRelationshipExpandedForScope.mockReturnValue(true);

      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relationshipsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );

      expect(relationshipsItem).toBeDefined();
      if (relationshipsItem?.type === 'item') {
        expect(relationshipsItem.label).toContain('Hide entity relationships');
        expect(relationshipsItem.disabled).toBe(false);
      }
    });

    it('should show "Show entity relationships" when entity is not expanded in the event bus', () => {
      const node = createMockNode('single-entity', true);
      mockIsEntityRelationshipExpandedForScope.mockReturnValue(false);

      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relationshipsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );

      expect(relationshipsItem).toBeDefined();
      if (relationshipsItem?.type === 'item') {
        expect(relationshipsItem.label).toContain('Show entity relationships');
      }
    });

    it('should not render "Show entity relationships" for grouped-entities mode', () => {
      const node = createMockNode('grouped-entities', true);
      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relationshipsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );

      expect(relationshipsItem).toBeUndefined();
    });

    it('should emit entity relationship toggle event when clicked (show)', () => {
      const node = createMockNode('single-entity', true);
      mockIsEntityRelationshipExpandedForScope.mockReturnValue(false);

      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relationshipsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );

      expect(relationshipsItem).toBeDefined();
      if (relationshipsItem?.type === 'item' && relationshipsItem.onClick) {
        relationshipsItem.onClick();
        expect(mockEmitEntityRelationshipToggle).toHaveBeenCalledWith(scopeId, node.id, 'show');
      }
    });

    it('should emit entity relationship toggle event when clicked (hide)', () => {
      const node = createMockNode('single-entity', true);
      mockIsEntityRelationshipExpandedForScope.mockReturnValue(true);

      renderHook(() => useEntityNodeExpandPopover(scopeId, mockOnOpenEventPreview));

      expect(capturedItemsFn).not.toBeNull();
      const items = capturedItemsFn!(node);

      const relationshipsItem = items.find(
        (item) =>
          item.type === 'item' &&
          item.testSubject === GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );

      expect(relationshipsItem).toBeDefined();
      if (relationshipsItem?.type === 'item' && relationshipsItem.onClick) {
        relationshipsItem.onClick();
        expect(mockEmitEntityRelationshipToggle).toHaveBeenCalledWith(scopeId, node.id, 'hide');
      }
    });
  });
});
