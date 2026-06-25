/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntityActionsButton } from './entity_actions_button';
import type { EntityItem } from '../types';
import { GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID } from '../../../test_ids';
import {
  GRAPH_NODE_POPOVER_SHOW_ENTITY_DETAILS_ITEM_ID,
  GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID,
  GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID,
} from '../../../../test_ids';
import {
  emitFilterToggle,
  emitIsOneOfFilterToggle,
  isFilterActiveForScope,
  emitEntityRelationshipToggle,
  isEntityRelationshipExpandedForScope,
  emitPinnedEuidToggle,
} from '../../../../filters/filter_store';
import { RELATED_ENTITY, RELATED_HOST, RELATED_USER } from '../../../../../common/constants';

jest.mock('../../../../filters/filter_store', () => {
  const actual = jest.requireActual('../../../../filters/filter_store');
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

const mockEmitFilterToggle = emitFilterToggle as jest.MockedFunction<typeof emitFilterToggle>;
const mockEmitIsOneOfFilterToggle = emitIsOneOfFilterToggle as jest.MockedFunction<
  typeof emitIsOneOfFilterToggle
>;
const mockIsFilterActiveForScope = isFilterActiveForScope as jest.MockedFunction<
  typeof isFilterActiveForScope
>;
const mockEmitEntityRelationshipToggle = emitEntityRelationshipToggle as jest.MockedFunction<
  typeof emitEntityRelationshipToggle
>;
const mockEmitPinnedEuidToggle = emitPinnedEuidToggle as jest.MockedFunction<
  typeof emitPinnedEuidToggle
>;
const mockIsEntityRelationshipExpandedForScope =
  isEntityRelationshipExpandedForScope as jest.MockedFunction<
    typeof isEntityRelationshipExpandedForScope
  >;

// Mock useExpandableFlyoutApi
const mockOpenPreviewPanel = jest.fn();
jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: jest.fn(() => ({
    openPreviewPanel: mockOpenPreviewPanel,
  })),
}));

describe('EntityActionsButton', () => {
  const mockEntityItem: EntityItem = {
    id: 'entity-123',
    itemType: 'entity',
    icon: 'user',
    label: 'Test Entity',
    entity: {
      availableInEntityStore: true,
      sourceFields: { 'entity.id': 'entity-abc' },
    },
  };

  const scopeId = 'test-scope-id';

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsFilterActiveForScope.mockReturnValue(false);
  });

  it('should render the actions button', () => {
    render(<EntityActionsButton item={mockEntityItem} scopeId={scopeId} />);

    expect(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID)).toBeInTheDocument();
  });

  it('should have correct aria-label', () => {
    render(<EntityActionsButton item={mockEntityItem} scopeId={scopeId} />);

    const button = screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID);
    expect(button).toHaveAttribute('aria-label', 'Actions');
  });

  describe('when popover is open', () => {
    it('should render entity details item with correct label', () => {
      render(<EntityActionsButton item={mockEntityItem} scopeId={scopeId} />);

      // Click the button to open the popover
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      // The popover should show entity details option
      expect(screen.getByText('Show entity details')).toBeInTheDocument();
    });

    it('should open preview panel when entity details is clicked', () => {
      render(<EntityActionsButton item={mockEntityItem} scopeId={scopeId} />);

      // Click the button to open the popover
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      const entityDetailsButton = screen.getByText('Show entity details');
      fireEvent.click(entityDetailsButton);

      expect(mockOpenPreviewPanel).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            entityId: mockEntityItem.id,
            scopeId,
          }),
        })
      );
    });

    describe('when entity is not available in entity store', () => {
      const notInStoreItem: EntityItem = {
        ...mockEntityItem,
        entity: { availableInEntityStore: false },
      };

      it('should render entity details item as disabled', () => {
        render(<EntityActionsButton item={notInStoreItem} scopeId={scopeId} />);

        fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

        const entityDetailsItem = screen.getByTestId(
          GRAPH_NODE_POPOVER_SHOW_ENTITY_DETAILS_ITEM_ID
        );
        expect(entityDetailsItem).toBeInTheDocument();
        expect(entityDetailsItem).toBeDisabled();
      });

      it('should not open preview panel when disabled entity details is clicked', () => {
        render(<EntityActionsButton item={notInStoreItem} scopeId={scopeId} />);

        fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

        const entityDetailsItem = screen.getByTestId(
          GRAPH_NODE_POPOVER_SHOW_ENTITY_DETAILS_ITEM_ID
        );
        fireEvent.click(entityDetailsItem);

        expect(mockOpenPreviewPanel).not.toHaveBeenCalled();
      });
    });
  });

  describe('related events toggle', () => {
    it('should emit RELATED_USER via isOneOf with user.* source field values when engine_type is user', () => {
      const userItem: EntityItem = {
        ...mockEntityItem,
        entity: {
          availableInEntityStore: true,
          engine_type: 'user',
          sourceFields: { 'user.name': 'alice', 'user.email': 'alice@example.com' },
        },
      };

      render(<EntityActionsButton item={userItem} scopeId={scopeId} />);
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      const relatedButton = screen.getByTestId(GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID);
      fireEvent.click(relatedButton);

      // Multiple values → emitIsOneOfFilterToggle with the full array
      expect(mockEmitIsOneOfFilterToggle).toHaveBeenCalledWith(
        scopeId,
        RELATED_USER,
        ['alice', 'alice@example.com'],
        'show'
      );
      expect(mockEmitFilterToggle).not.toHaveBeenCalledWith(
        scopeId,
        RELATED_ENTITY,
        expect.anything(),
        expect.anything()
      );
    });

    it('should emit RELATED_HOST via isOneOf with host.* source field values when engine_type is host', () => {
      const hostItem: EntityItem = {
        ...mockEntityItem,
        entity: {
          availableInEntityStore: true,
          engine_type: 'host',
          sourceFields: { 'host.name': 'server-1', 'host.ip': '10.0.0.1' },
        },
      };

      render(<EntityActionsButton item={hostItem} scopeId={scopeId} />);
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      const relatedButton = screen.getByTestId(GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID);
      fireEvent.click(relatedButton);

      expect(mockEmitIsOneOfFilterToggle).toHaveBeenCalledWith(
        scopeId,
        RELATED_HOST,
        ['server-1', '10.0.0.1'],
        'show'
      );
      expect(mockEmitFilterToggle).not.toHaveBeenCalledWith(
        scopeId,
        RELATED_ENTITY,
        expect.anything(),
        expect.anything()
      );
    });

    it('should fall back to RELATED_ENTITY with entity.* source field values + item.id when engine_type is not user or host', () => {
      render(<EntityActionsButton item={mockEntityItem} scopeId={scopeId} />);
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      const relatedButton = screen.getByTestId(GRAPH_NODE_POPOVER_SHOW_RELATED_ITEM_ID);
      fireEvent.click(relatedButton);

      // entity.* value ('entity-abc') + item.id ('entity-123') → emitIsOneOfFilterToggle
      expect(mockEmitIsOneOfFilterToggle).toHaveBeenCalledWith(
        scopeId,
        RELATED_ENTITY,
        ['entity-abc', 'entity-123'],
        'show'
      );
      expect(mockEmitFilterToggle).not.toHaveBeenCalledWith(
        scopeId,
        RELATED_ENTITY,
        expect.anything(),
        expect.anything()
      );
    });

    it('should show "Hide related events" label when RELATED_USER filter is active', () => {
      const userItem: EntityItem = {
        ...mockEntityItem,
        entity: {
          availableInEntityStore: true,
          engine_type: 'user',
          sourceFields: { 'user.name': 'alice' },
        },
      };
      mockIsFilterActiveForScope.mockImplementation(
        (_, field, value) =>
          field === RELATED_USER && Array.isArray(value) && value.includes('alice')
      );

      render(<EntityActionsButton item={userItem} scopeId={scopeId} />);
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      expect(screen.getByText('Hide related events')).toBeInTheDocument();
    });
  });

  describe('entity relationships toggle', () => {
    it('should emit both emitEntityRelationshipToggle and emitPinnedEuidToggle with "show" when clicking Show entity relationships', () => {
      mockIsEntityRelationshipExpandedForScope.mockReturnValue(false);

      render(<EntityActionsButton item={mockEntityItem} scopeId={scopeId} />);
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      const relationshipsBtn = screen.getByTestId(
        GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );
      fireEvent.click(relationshipsBtn);

      expect(mockEmitEntityRelationshipToggle).toHaveBeenCalledWith(
        scopeId,
        mockEntityItem.id,
        'show'
      );
      expect(mockEmitPinnedEuidToggle).toHaveBeenCalledWith(scopeId, mockEntityItem.id, 'show');
    });

    it('should emit both emitEntityRelationshipToggle and emitPinnedEuidToggle with "hide" when clicking Hide entity relationships', () => {
      mockIsEntityRelationshipExpandedForScope.mockReturnValue(true);

      render(<EntityActionsButton item={mockEntityItem} scopeId={scopeId} />);
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      const relationshipsBtn = screen.getByTestId(
        GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );
      fireEvent.click(relationshipsBtn);

      expect(mockEmitEntityRelationshipToggle).toHaveBeenCalledWith(
        scopeId,
        mockEntityItem.id,
        'hide'
      );
      expect(mockEmitPinnedEuidToggle).toHaveBeenCalledWith(scopeId, mockEntityItem.id, 'hide');
    });

    it('should show "Hide entity relationships" label when relationships are already expanded', () => {
      mockIsEntityRelationshipExpandedForScope.mockReturnValue(true);

      render(<EntityActionsButton item={mockEntityItem} scopeId={scopeId} />);
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      expect(screen.getByText('Hide entity relationships')).toBeInTheDocument();
    });

    it('should disable the relationships item when isInitialEntity is true', () => {
      render(
        <EntityActionsButton item={mockEntityItem} scopeId={scopeId} isInitialEntity={true} />
      );
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      const relationshipsBtn = screen.getByTestId(
        GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );
      expect(relationshipsBtn).toBeDisabled();
    });

    it('should disable the relationships item when entity is not available in entity store', () => {
      const notInStoreItem: EntityItem = {
        ...mockEntityItem,
        entity: { availableInEntityStore: false },
      };

      render(<EntityActionsButton item={notInStoreItem} scopeId={scopeId} />);
      fireEvent.click(screen.getByTestId(GROUPED_ITEM_ACTIONS_BUTTON_TEST_ID));

      const relationshipsBtn = screen.getByTestId(
        GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID
      );
      expect(relationshipsBtn).toBeDisabled();
    });
  });
});
