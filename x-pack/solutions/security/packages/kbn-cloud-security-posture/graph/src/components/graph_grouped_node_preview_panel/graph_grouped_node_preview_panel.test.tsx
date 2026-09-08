/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GraphGroupedNodePreviewPanel } from './graph_grouped_node_preview_panel';
import type { AlertItem, EntityItem, EventItem } from './components/grouped_item/types';
import { useFetchDocumentDetails } from './use_fetch_document_details';

import {
  LOADING_BODY_TEST_ID,
  EMPTY_BODY_TEST_ID,
  CONTENT_BODY_TEST_ID,
  PAGE_SIZE_BTN_TEST_ID,
  TOTAL_HITS_TEST_ID,
  ICON_TEST_ID,
  GROUPED_ITEMS_TYPE_TEST_ID,
  GROUPED_ITEM_TEST_ID,
  PAGINATION_BUTTON_NEXT_TEST_ID,
} from './test_ids';
import { DOCUMENT_TYPE_EVENT } from '@kbn/cloud-security-posture-common/schema/graph/v1';
import { GROUPED_PREVIEW_PAGINATION_SETTINGS_KEY } from './use_pagination';
import { getOrCreateFilterStore, destroyFilterStore } from '../filters/filter_store';

// Mock the hook
jest.mock('./use_fetch_document_details');

// Mock expandable flyout API
jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: () => ({
    openPreviewPanel: jest.fn(),
  }),
}));

const mockUseFetchDocumentDetails = useFetchDocumentDetails as jest.MockedFunction<
  typeof useFetchDocumentDetails
>;
const createMockHookResult = (
  overrides?: Partial<ReturnType<typeof useFetchDocumentDetails>>
): ReturnType<typeof useFetchDocumentDetails> => ({
  data: { page: [], total: 0 },
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  refresh: jest.fn(),
  ...overrides,
});

const TEST_DATA_VIEW_ID = 'test-data-view-id';

// Use unique scopeId per test run to prevent cross-test pollution
let TEST_SCOPE_ID: string;
let defaultProps: {
  scopeId: string;
  docMode: 'grouped-entities';
  dataViewId: string;
  documentIds: string[];
  entityItems: EntityItem[];
  onShowDocument: (docId: string, indexName?: string, isEvent?: boolean) => void;
  onShowEntity: (params: {
    engineType: string | undefined;
    entityId: string;
    entityName: string | undefined;
  }) => void;
};

describe('GraphGroupedNodePreviewPanel', () => {
  let entityIdCounter = 0;

  const createEntityItem = (overrides?: Partial<EntityItem>): EntityItem => {
    entityIdCounter += 1;
    return {
      id: `entity-${entityIdCounter}`,
      itemType: 'entity',
      icon: 'storage',
      label: 'Test Host',
      entity: { type: 'host' },
      ...overrides,
    };
  };

  beforeEach(() => {
    // Generate unique scopeId for each test
    TEST_SCOPE_ID = `test-scope-${Math.random().toString(36).substring(7)}`;
    // Set defaultProps with the new scopeId
    defaultProps = {
      scopeId: TEST_SCOPE_ID,
      docMode: 'grouped-entities' as const,
      dataViewId: TEST_DATA_VIEW_ID,
      documentIds: ['doc-1', 'doc-2', 'doc-3'],
      entityItems: [] as EntityItem[],
      onShowDocument: jest.fn(),
      onShowEntity: jest.fn(),
    };
    getOrCreateFilterStore(TEST_SCOPE_ID);
    jest.clearAllMocks();
    localStorage.clear();
    entityIdCounter = 0;
    mockUseFetchDocumentDetails.mockReturnValue(
      createMockHookResult({
        data: undefined as unknown as { page: (EventItem | AlertItem)[]; total: number },
      })
    );
  });

  afterEach(() => {
    destroyFilterStore(TEST_SCOPE_ID);
  });

  describe('Rendering States', () => {
    describe('Loading State', () => {
      it('should render LoadingBody when isLoading is true', () => {
        mockUseFetchDocumentDetails.mockReturnValue(
          createMockHookResult({
            data: undefined as unknown as { page: (EventItem | AlertItem)[]; total: number },
            isLoading: true,
          })
        );

        render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

        expect(screen.getByTestId(LOADING_BODY_TEST_ID)).toBeInTheDocument();
        expect(screen.queryByTestId(CONTENT_BODY_TEST_ID)).not.toBeInTheDocument();
        expect(screen.queryByTestId(EMPTY_BODY_TEST_ID)).not.toBeInTheDocument();
      });

      it('should render LoadingBody only for grouped-events mode during data fetch', () => {
        mockUseFetchDocumentDetails.mockReturnValue(
          createMockHookResult({
            data: undefined as unknown as { page: (EventItem | AlertItem)[]; total: number },
            isLoading: true,
          })
        );

        render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

        expect(screen.getByTestId(LOADING_BODY_TEST_ID)).toBeInTheDocument();
      });

      it('should NOT show loading for grouped-entities mode with items', () => {
        const entityItems = [createEntityItem()];
        mockUseFetchDocumentDetails.mockReturnValue(
          createMockHookResult({
            data: undefined as unknown as { page: (EventItem | AlertItem)[]; total: number },
          })
        );

        render(
          <GraphGroupedNodePreviewPanel
            {...defaultProps}
            docMode="grouped-entities"
            entityItems={entityItems}
          />
        );

        expect(screen.queryByTestId(LOADING_BODY_TEST_ID)).not.toBeInTheDocument();
        expect(screen.getByTestId(CONTENT_BODY_TEST_ID)).toBeInTheDocument();
      });
    });

    describe('Empty State', () => {
      it('should render EmptyBody when items array is empty after loading', () => {
        mockUseFetchDocumentDetails.mockReturnValue(createMockHookResult());

        render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

        expect(screen.getByTestId(EMPTY_BODY_TEST_ID)).toBeInTheDocument();
        expect(screen.queryByTestId(LOADING_BODY_TEST_ID)).not.toBeInTheDocument();
        expect(screen.queryByTestId(CONTENT_BODY_TEST_ID)).not.toBeInTheDocument();
      });
    });

    describe('Content State', () => {
      it('should render ContentBody with valid data', () => {
        const entityItems = [createEntityItem()];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(CONTENT_BODY_TEST_ID)).toBeInTheDocument();
        expect(screen.queryByTestId(LOADING_BODY_TEST_ID)).not.toBeInTheDocument();
        expect(screen.queryByTestId(EMPTY_BODY_TEST_ID)).not.toBeInTheDocument();
      });

      it('should render icon, title, and grouped type in ContentBody', () => {
        const entityItems = [createEntityItem({ icon: 'test-icon', entity: { type: 'host' } })];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(TOTAL_HITS_TEST_ID)).toBeInTheDocument();
        expect(screen.getByTestId(ICON_TEST_ID)).toBeInTheDocument();
        expect(screen.getByTestId(GROUPED_ITEMS_TYPE_TEST_ID)).toBeInTheDocument();
        // Pagination should not be visible with only 1 item (less than MIN_PAGE_SIZE)
        expect(screen.queryByTestId(PAGE_SIZE_BTN_TEST_ID)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Page 1/)).not.toBeInTheDocument();
      });

      it('should display correct icon based on entity type', () => {
        const entityItems = [createEntityItem({ icon: 'custom-icon' })];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(ICON_TEST_ID)).toHaveAttribute(
          'data-euiicon-type',
          'custom-icon'
        );
      });

      it('should display correct groupedItemsType label', () => {
        const entityItems = [createEntityItem({ entity: { type: 'user' } })];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(GROUPED_ITEMS_TYPE_TEST_ID)).toHaveTextContent('Users');
      });
    });
  });

  describe('Pagination Behavior', () => {
    describe('Initial Pagination State', () => {
      it('should start with default pagination pageIndex: 0, pageSize: 10 when items >= MIN_PAGE_SIZE', () => {
        const entityItems = Array.from({ length: 15 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        // EUI pagination uses 1-based indexing for display
        expect(screen.getByLabelText(/Page 1/)).toBeInTheDocument();
        expect(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID)).toHaveTextContent('Rows per page: 10');
      });

      it('should hide pagination when items < MIN_PAGE_SIZE', () => {
        const entityItems = Array.from({ length: 5 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        // Pagination should not be visible with only 5 items
        expect(screen.queryByTestId(PAGE_SIZE_BTN_TEST_ID)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Page 1/)).not.toBeInTheDocument();
      });
    });

    describe('Page Size Changes', () => {
      it('should reset pageIndex to 0 when changing pageSize to 50', async () => {
        // Use a single userEvent instance for all three clicks to avoid the
        // per-call setup/teardown overhead of the compat API, which causes the
        // test to exceed the 5000ms default timeout on loaded CI agents.
        // pointerEventsCheck: 0 is set globally so the popover item click
        // (which has pointer-events:none in EUI) is not blocked.
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const entityItems = Array.from({ length: 50 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        // Navigate to page 2 first (showing items 11-20)
        await user.click(screen.getByTestId(PAGINATION_BUTTON_NEXT_TEST_ID));
        expect(screen.getByLabelText(/Page 2/)).toBeInTheDocument();

        // Change page size by opening popover and selecting 50
        await user.click(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID));
        await user.click(screen.getByText('50 rows'));

        await waitFor(() => {
          // Should reset to page 1 (index 0)
          expect(screen.getByLabelText(/Page 1/)).toBeInTheDocument();
          expect(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID)).toHaveTextContent('Rows per page: 50');
        });
      });

      it('should slice items correctly based on new pageSize', async () => {
        const entityItems = Array.from({ length: 50 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        // Initially shows 10 items
        expect(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID)).toHaveTextContent('Rows per page: 10');

        // Change to 50
        await userEvent.click(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID));
        // Use pointerEventsCheck: 0 to skip pointer-events check for popover items
        await userEvent.click(screen.getByText('50 rows'), { pointerEventsCheck: 0 });

        await waitFor(() => {
          expect(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID)).toHaveTextContent('Rows per page: 50');
        });
      });
    });

    describe('Page Navigation', () => {
      it('should navigate to page 2 and display correct items', async () => {
        const entityItems = Array.from({ length: 50 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByLabelText(/Page 1/)).toBeInTheDocument();

        await userEvent.click(screen.getByTestId(PAGINATION_BUTTON_NEXT_TEST_ID));

        await waitFor(() => {
          expect(screen.getByLabelText(/Page 2/)).toBeInTheDocument();
          expect(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID)).toHaveTextContent('Rows per page: 10');
        });
      });

      it('should update pageIndex correctly on navigation', async () => {
        const entityItems = Array.from({ length: 50 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        await userEvent.click(screen.getByTestId(PAGINATION_BUTTON_NEXT_TEST_ID));

        await waitFor(() => {
          expect(screen.getByLabelText(/Page 2/)).toBeInTheDocument();
        });
      });
    });

    describe('Remount Behavior', () => {
      it('should always reset to page 1 (pageIndex: 0) on mount, even with valid pageIndex in localStorage (grouped-entities)', () => {
        const entityItems = Array.from({ length: 50 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );

        // Simulate localStorage with pageSize=20
        // pageIndex is no longer stored in localStorage, always starts at 0
        localStorage.setItem(
          GROUPED_PREVIEW_PAGINATION_SETTINGS_KEY,
          JSON.stringify({ pageSize: 20 })
        );

        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        // Should ALWAYS start at page 1 (pageIndex=0), regardless of localStorage
        expect(screen.getByTestId(CONTENT_BODY_TEST_ID)).toBeInTheDocument();
        expect(screen.getByLabelText(/Page 1/)).toBeInTheDocument();
        expect(mockUseFetchDocumentDetails).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({ pageIndex: 0 }),
          })
        );
        expect(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID)).toHaveTextContent('Rows per page: 20');
      });

      it('should always reset to page 1 (pageIndex: 0) on mount with pageSize from localStorage (grouped-events)', () => {
        // Simulate localStorage with pageSize=10
        // pageIndex is no longer stored in localStorage
        localStorage.setItem(
          GROUPED_PREVIEW_PAGINATION_SETTINGS_KEY,
          JSON.stringify({ pageSize: 10 })
        );

        const mockData = {
          page: [{ id: 'event-1', itemType: DOCUMENT_TYPE_EVENT }],
          total: 5,
        };
        mockUseFetchDocumentDetails.mockReturnValue(createMockHookResult({ data: mockData }));

        render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

        // Should show content and call hook with pageIndex=0 (server-side pagination)
        expect(screen.getByTestId(CONTENT_BODY_TEST_ID)).toBeInTheDocument();
        expect(mockUseFetchDocumentDetails).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({ pageIndex: 0 }),
          })
        );
      });
    });

    describe('Pagination Edge Cases', () => {
      it('should hide pagination when total items less than MIN_PAGE_SIZE (single page)', () => {
        const entityItems = Array.from({ length: 5 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        // Pagination should be hidden when totalHits < MIN_PAGE_SIZE
        expect(screen.queryByTestId(PAGE_SIZE_BTN_TEST_ID)).not.toBeInTheDocument();
        expect(screen.getByTestId(TOTAL_HITS_TEST_ID)).toHaveTextContent('5');
      });

      it('should hide pagination when total items equal pageSize (boundary case)', () => {
        const entityItems = Array.from({ length: 10 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        // Pagination should be hidden when totalHits === MIN_PAGE_SIZE (all items fit in one page)
        expect(screen.queryByTestId(PAGE_SIZE_BTN_TEST_ID)).not.toBeInTheDocument();
        expect(screen.getByTestId(TOTAL_HITS_TEST_ID)).toHaveTextContent('10');
      });

      it('should show pagination when total items one more than MIN_PAGE_SIZE (2 pages)', () => {
        const entityItems = Array.from({ length: 11 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        // Pagination should be visible with 11 items (more than MIN_PAGE_SIZE)
        expect(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID)).toHaveTextContent('Rows per page: 10');
        expect(screen.getByTestId(TOTAL_HITS_TEST_ID)).toHaveTextContent('11');
      });
    });
  });

  describe('Mode-Specific Behavior', () => {
    describe('Grouped Entities Mode', () => {
      it('should use entityItems prop directly without fetch', () => {
        const entityItems = [createEntityItem()];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(mockUseFetchDocumentDetails).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({ enabled: false }),
          })
        );
      });

      it('should handle empty array', () => {
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={[]} />);

        expect(screen.getByTestId(EMPTY_BODY_TEST_ID)).toBeInTheDocument();
      });

      // Regression test for https://github.com/elastic/kibana/issues/275261
      // When switching between grouped nodes, the flyout reuses the same panel
      // component instance (same panel key => no remount) and only updates props.
      // A grouped node can contain several items resolving to the same entity `id`
      // (one per underlying event permutation). If the list keys are not unique,
      // React fails to reconcile the list and leaves stale <li> nodes mounted, so
      // the previous group's entities accumulate on top of the current group's.
      it('should render exactly the current entityItems when switching groups (no accumulation)', () => {
        // Group A: 4 items but only 2 unique entity ids (duplicate ids on purpose).
        const groupA: EntityItem[] = [
          createEntityItem({ id: 'user-1' }),
          createEntityItem({ id: 'user-1' }),
          createEntityItem({ id: 'user-2' }),
          createEntityItem({ id: 'user-2' }),
        ];
        const groupB: EntityItem[] = [
          createEntityItem({ id: 'bucket-1' }),
          createEntityItem({ id: 'bucket-2' }),
        ];

        const { rerender } = render(
          <GraphGroupedNodePreviewPanel {...defaultProps} entityItems={groupA} />
        );
        expect(screen.getAllByTestId(GROUPED_ITEM_TEST_ID)).toHaveLength(4);

        // Switch to group B (same component instance, only props change).
        rerender(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={groupB} />);
        expect(screen.getAllByTestId(GROUPED_ITEM_TEST_ID)).toHaveLength(2);

        // Switch back to group A: must show A's items only, not A+B accumulated.
        rerender(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={groupA} />);
        expect(screen.getAllByTestId(GROUPED_ITEM_TEST_ID)).toHaveLength(4);
      });

      it('should use client-side pagination slicing', () => {
        const entityItems = Array.from({ length: 25 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID)).toHaveTextContent('10');
        expect(screen.getByTestId(TOTAL_HITS_TEST_ID)).toHaveTextContent('25');
      });

      it('should have total hits equal to entityItems.length', () => {
        const entityItems = Array.from({ length: 37 }, (_, i) =>
          createEntityItem({ id: `entity-${i}` })
        );
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(TOTAL_HITS_TEST_ID)).toHaveTextContent('37');
      });

      it('should derive icon from first entity icon property', () => {
        const entityItems = [createEntityItem({ icon: 'first-icon' })];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(ICON_TEST_ID)).toHaveAttribute('data-euiicon-type', 'first-icon');
      });

      it('should default to "index" icon when not possible to derive icon from entities', () => {
        const entityItems = [createEntityItem({ icon: undefined })];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(ICON_TEST_ID)).toHaveAttribute('data-euiicon-type', 'index');
      });

      it('should derive groupedItemsType from first entity type - this should never happened', () => {
        const entityItems = [
          createEntityItem({ entity: { type: 'host' } }),
          createEntityItem({ entity: { type: 'user' } }),
        ];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(GROUPED_ITEMS_TYPE_TEST_ID)).toHaveTextContent('Hosts');
      });

      it('should display "Hosts" label for host type', () => {
        const entityItems = [createEntityItem({ entity: { type: 'host' } })];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(GROUPED_ITEMS_TYPE_TEST_ID)).toHaveTextContent('Hosts');
      });

      it('should display "Users" label for user type', () => {
        const entityItems = [createEntityItem({ entity: { type: 'user' } })];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(GROUPED_ITEMS_TYPE_TEST_ID)).toHaveTextContent('Users');
      });

      it('should display "Entities" label for unknown type', () => {
        const entityItems = [createEntityItem({ entity: { type: 'unknown' } })];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(GROUPED_ITEMS_TYPE_TEST_ID)).toHaveTextContent('Entities');
      });

      it('should display "Entities" label when type is undefined', () => {
        const entityItems = [createEntityItem({ entity: { type: undefined } })];
        render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={entityItems} />);

        expect(screen.getByTestId(GROUPED_ITEMS_TYPE_TEST_ID)).toHaveTextContent('Entities');
      });
    });

    describe('Grouped Events Mode', () => {
      it('should handle empty array', () => {
        render(<GraphGroupedNodePreviewPanel {...defaultProps} documentIds={[]} />);

        expect(screen.getByTestId(EMPTY_BODY_TEST_ID)).toBeInTheDocument();
      });

      it('should pass documentIds to hook', () => {
        const documentIds = ['doc-1', 'doc-2'];
        render(
          <GraphGroupedNodePreviewPanel
            {...defaultProps}
            docMode="grouped-events"
            documentIds={documentIds}
          />
        );

        expect(mockUseFetchDocumentDetails).toHaveBeenCalledWith(
          expect.objectContaining({
            ids: documentIds,
          })
        );
      });

      it('should pass pagination parameters to hook', async () => {
        mockUseFetchDocumentDetails.mockReturnValue(
          createMockHookResult({
            data: { page: [{ id: 'event-1', itemType: DOCUMENT_TYPE_EVENT }], total: 50 },
          })
        );

        render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

        expect(mockUseFetchDocumentDetails).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({
              pageIndex: 0,
              pageSize: 10,
            }),
          })
        );
      });

      it('should enable hook only when docMode is grouped-events', () => {
        render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

        expect(mockUseFetchDocumentDetails).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({ enabled: true }),
          })
        );
      });

      it('should use total hits from fetched data', () => {
        const mockData = {
          page: [
            { id: 'event-1', itemType: DOCUMENT_TYPE_EVENT },
            { id: 'event-2', itemType: DOCUMENT_TYPE_EVENT },
          ],
          total: 2,
        };
        mockUseFetchDocumentDetails.mockReturnValue(createMockHookResult({ data: mockData }));

        render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

        expect(screen.getByTestId(TOTAL_HITS_TEST_ID)).toHaveTextContent('2');
      });

      it('should default icon to "index"', () => {
        const mockData = {
          page: [{ id: 'event-1', itemType: DOCUMENT_TYPE_EVENT }],
          total: 1,
        };
        mockUseFetchDocumentDetails.mockReturnValue(createMockHookResult({ data: mockData }));

        render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

        expect(screen.getByTestId(ICON_TEST_ID)).toHaveAttribute('data-euiicon-type', 'index');
      });

      it('should display "Events" label for groupedItemsType', () => {
        const mockData = {
          page: [{ id: 'event-1', itemType: DOCUMENT_TYPE_EVENT }],
          total: 1,
        };
        mockUseFetchDocumentDetails.mockReturnValue(createMockHookResult({ data: mockData }));

        render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

        expect(screen.getByTestId(GROUPED_ITEMS_TYPE_TEST_ID)).toHaveTextContent('Events');
      });

      it('should use server-side pagination (fetch only current page)', async () => {
        mockUseFetchDocumentDetails.mockReturnValue(
          createMockHookResult({
            data: { page: [{ id: 'event-1', itemType: DOCUMENT_TYPE_EVENT }], total: 11 },
          })
        );

        const { rerender } = render(
          <GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />
        );

        // Simulate page change by forcing re-render with updated hook response
        mockUseFetchDocumentDetails.mockReturnValue(
          createMockHookResult({
            data: { page: [{ id: 'event-11', itemType: DOCUMENT_TYPE_EVENT }], total: 11 },
          })
        );

        rerender(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

        await userEvent.click(screen.getByTestId(PAGINATION_BUTTON_NEXT_TEST_ID));

        await waitFor(() => {
          expect(mockUseFetchDocumentDetails).toHaveBeenLastCalledWith(
            expect.objectContaining({
              options: expect.objectContaining({
                pageIndex: 1,
                pageSize: 10,
              }),
            })
          );
        });
      });
    });
  });

  describe('useFetchDocumentDetails hook', () => {
    it('should be called with correct dataViewId', () => {
      render(<GraphGroupedNodePreviewPanel {...defaultProps} dataViewId="custom-view-id" />);

      expect(mockUseFetchDocumentDetails).toHaveBeenCalledWith(
        expect.objectContaining({
          dataViewId: 'custom-view-id',
        })
      );
    });

    it('should receive correct pageIndex', async () => {
      mockUseFetchDocumentDetails.mockReturnValue(
        createMockHookResult({
          data: { page: [{ id: 'event-1', itemType: DOCUMENT_TYPE_EVENT }], total: 50 },
        })
      );

      render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

      await userEvent.click(screen.getByTestId(PAGINATION_BUTTON_NEXT_TEST_ID));

      await waitFor(() => {
        expect(mockUseFetchDocumentDetails).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({ pageIndex: 1 }),
          })
        );
      });
    });

    it('should receive correct pageSize', async () => {
      mockUseFetchDocumentDetails.mockReturnValue(
        createMockHookResult({
          data: { page: [{ id: 'event-1', itemType: DOCUMENT_TYPE_EVENT }], total: 50 },
        })
      );

      render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

      // Change page size
      await userEvent.click(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID));
      // Use pointerEventsCheck: 0 to skip pointer-events check for popover items
      await userEvent.click(screen.getByText('50 rows'), { pointerEventsCheck: 0 });

      await waitFor(() => {
        expect(mockUseFetchDocumentDetails).toHaveBeenLastCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({ pageSize: 50 }),
          })
        );
      });
    });
    it('should return loading state correctly', () => {
      mockUseFetchDocumentDetails.mockReturnValue(
        createMockHookResult({
          data: undefined as unknown as { page: (EventItem | AlertItem)[]; total: number },
          isLoading: true,
          error: false,
        })
      );

      render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

      expect(screen.getByTestId(LOADING_BODY_TEST_ID)).toBeInTheDocument();
    });

    it('should return data correctly', () => {
      const mockData = {
        page: [{ id: 'event-1', itemType: DOCUMENT_TYPE_EVENT }],
        total: 1,
      };
      mockUseFetchDocumentDetails.mockReturnValue(createMockHookResult({ data: mockData }));

      render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

      expect(screen.getByTestId(CONTENT_BODY_TEST_ID)).toBeInTheDocument();
    });
  });

  describe('Async State Management', () => {
    it('should handle Loading → Empty transition', () => {
      mockUseFetchDocumentDetails.mockReturnValue(
        createMockHookResult({
          data: undefined as unknown as { page: (EventItem | AlertItem)[]; total: number },
          isLoading: true,
        })
      );

      const { unmount } = render(
        <GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />
      );

      expect(screen.getByTestId(LOADING_BODY_TEST_ID)).toBeInTheDocument();

      unmount();

      mockUseFetchDocumentDetails.mockReturnValue(
        createMockHookResult({
          data: { page: [], total: 0 },
        })
      );

      render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

      expect(screen.queryByTestId(LOADING_BODY_TEST_ID)).not.toBeInTheDocument();
      expect(screen.getByTestId(EMPTY_BODY_TEST_ID)).toBeInTheDocument();
    });

    it('should handle Loading → Content transition', async () => {
      mockUseFetchDocumentDetails.mockReturnValue(
        createMockHookResult({
          data: undefined as unknown as { page: (EventItem | AlertItem)[]; total: number },
          isLoading: true,
        })
      );

      const { unmount } = render(
        <GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />
      );

      expect(screen.getByTestId(LOADING_BODY_TEST_ID)).toBeInTheDocument();

      unmount();

      mockUseFetchDocumentDetails.mockReturnValue(
        createMockHookResult({
          data: { page: [{ id: 'event-1', itemType: DOCUMENT_TYPE_EVENT }], total: 1 },
        })
      );

      render(<GraphGroupedNodePreviewPanel {...defaultProps} docMode="grouped-events" />);

      await waitFor(() => {
        expect(screen.queryByTestId(LOADING_BODY_TEST_ID)).not.toBeInTheDocument();
        expect(screen.getByTestId(CONTENT_BODY_TEST_ID)).toBeInTheDocument();
      });
    });
  });

  describe('Performance Testing', () => {
    it('should handle 1000+ entities with pagination', () => {
      const largeEntityItems = Array.from({ length: 1500 }, (_, i) =>
        createEntityItem({ id: `entity-${i}` })
      );
      render(<GraphGroupedNodePreviewPanel {...defaultProps} entityItems={largeEntityItems} />);

      expect(screen.getByTestId(PAGE_SIZE_BTN_TEST_ID)).toHaveTextContent(/Rows per page: \d+/);
      expect(screen.getByTestId(TOTAL_HITS_TEST_ID)).toHaveTextContent('1500');
    });
  });
});
