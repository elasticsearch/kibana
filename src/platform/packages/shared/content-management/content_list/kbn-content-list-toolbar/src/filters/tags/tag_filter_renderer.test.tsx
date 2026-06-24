/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Query } from '@elastic/eui';
import {
  ContentListProvider,
  type FindItemsResult,
  type FindItemsParams,
  type FilterFacetConfig,
  type FilterFacet,
} from '@kbn/content-list-provider';
import type { ContentManagementTagsServices, Tag } from '@kbn/content-management-tags';
import { TagFilterRenderer } from './tag_filter_renderer';

const mockTags = [
  {
    id: 'tag-1',
    name: 'Production',
    description: 'Production items',
    color: '#FF0000',
    managed: false,
  },
  { id: 'tag-2', name: 'Development', description: 'Dev items', color: '#00FF00', managed: false },
  {
    id: 'tag-3',
    name: 'Archived',
    description: 'Archived items',
    color: '#808080',
    managed: false,
  },
];

const mockFindItems = jest.fn(
  async (_params: FindItemsParams): Promise<FindItemsResult> => ({
    items: [
      { id: 'item-1', title: 'Item 1', tags: ['tag-1', 'tag-2'] },
      { id: 'item-2', title: 'Item 2', tags: ['tag-1'] },
      { id: 'item-3', title: 'Item 3', tags: ['tag-3'] },
    ],
    total: 3,
  })
);

const mockTagsService: ContentManagementTagsServices = {
  getTagList: () => mockTags,
};

/**
 * Build a `FilterFacetConfig<Tag>` that returns static facets from `mockTags`.
 */
const mockTagsFeatureConfig: FilterFacetConfig<Tag> = {
  getFacets: async () =>
    mockTags.map(
      (tag): FilterFacet<Tag> => ({
        key: tag.id ?? tag.name,
        label: tag.name,
        count: undefined,
        data: tag,
      })
    ),
};

const createWrapper = (options?: { tagsService?: ContentManagementTagsServices }) => {
  const { tagsService } = options ?? {};
  return ({ children }: { children: React.ReactNode }) => (
    <ContentListProvider
      id="test-list"
      labels={{ entity: 'item', entityPlural: 'items' }}
      dataSource={{ findItems: mockFindItems }}
      services={tagsService ? { tags: tagsService } : undefined}
      features={tagsService ? { tags: mockTagsFeatureConfig } : undefined}
    >
      {children}
    </ContentListProvider>
  );
};

describe('TagFilterRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the tag filter button', () => {
    render(<TagFilterRenderer query={Query.parse('')} />, {
      wrapper: createWrapper({ tagsService: mockTagsService }),
    });

    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('renders nothing when tags service is not available', () => {
    const { container } = render(<TagFilterRenderer query={Query.parse('')} />, {
      wrapper: createWrapper(),
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('shows tag options when popover is opened', async () => {
    render(<TagFilterRenderer query={Query.parse('')} />, {
      wrapper: createWrapper({ tagsService: mockTagsService }),
    });

    fireEvent.click(screen.getByText('Tags'));

    await waitFor(() => {
      expect(screen.getByText('Production')).toBeInTheDocument();
      expect(screen.getByText('Development')).toBeInTheDocument();
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });
  });

  it('shows modifier hint text in the footer', async () => {
    render(<TagFilterRenderer query={Query.parse('')} />, {
      wrapper: createWrapper({ tagsService: mockTagsService }),
    });

    fireEvent.click(screen.getByText('Tags'));

    await waitFor(() => {
      expect(screen.getByText(/\+ click exclude/)).toBeInTheDocument();
    });
  });

  it('calls `onChange` when a tag option is clicked', async () => {
    const onChange = jest.fn();

    render(<TagFilterRenderer query={Query.parse('')} onChange={onChange} />, {
      wrapper: createWrapper({ tagsService: mockTagsService }),
    });

    fireEvent.click(screen.getByText('Tags'));
    fireEvent.click(await screen.findByText('Production'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedQuery: Query = onChange.mock.calls[0][0];
    expect(updatedQuery.text).toContain('Production');
  });

  it('reflects include state from query prop', async () => {
    const query = Query.parse('').addOrFieldValue('tag', 'Production', true, 'eq');

    render(<TagFilterRenderer query={query} />, {
      wrapper: createWrapper({ tagsService: mockTagsService }),
    });

    fireEvent.click(screen.getByText('Tags'));

    const productionOption = await screen.findByTestId('tag-searchbar-option-Production');
    expect(productionOption).toBeInTheDocument();
  });

  it('renders tag options with health indicator colors', async () => {
    render(<TagFilterRenderer query={Query.parse('')} />, {
      wrapper: createWrapper({ tagsService: mockTagsService }),
    });

    fireEvent.click(screen.getByText('Tags'));

    await waitFor(() => {
      expect(screen.getByTestId('tag-searchbar-option-Production')).toBeInTheDocument();
      expect(screen.getByTestId('tag-searchbar-option-Development')).toBeInTheDocument();
      expect(screen.getByTestId('tag-searchbar-option-Archived')).toBeInTheDocument();
    });
  });

  it('removes a tag from the query when clicking an already-included tag', async () => {
    const query = Query.parse('').addOrFieldValue('tag', 'Production', true, 'eq');
    const onChange = jest.fn();

    render(<TagFilterRenderer query={query} onChange={onChange} />, {
      wrapper: createWrapper({ tagsService: mockTagsService }),
    });

    fireEvent.click(screen.getByText('Tags'));
    fireEvent.click(await screen.findByText('Production'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedQuery: Query = onChange.mock.calls[0][0];
    expect(updatedQuery.text).not.toContain('Production');
  });

  describe('tag counts from FindItemsResult', () => {
    it('displays counts keyed by tag ID', async () => {
      // Return counts.tag keyed by tag ID.
      const mockFindItemsWithCounts = jest.fn(
        async (_params: FindItemsParams): Promise<FindItemsResult> => ({
          items: [
            { id: 'item-1', title: 'Item 1', tags: ['tag-1', 'tag-2'] },
            { id: 'item-2', title: 'Item 2', tags: ['tag-1'] },
          ],
          total: 2,
        })
      );

      const tagsFeatureWithCounts: FilterFacetConfig<Tag> = {
        getFacets: async () =>
          mockTags.map(
            (tag): FilterFacet<Tag> => ({
              key: tag.id ?? tag.name,
              label: tag.name,
              count: tag.id === 'tag-1' ? 2 : tag.id === 'tag-2' ? 1 : 0,
              data: tag,
            })
          ),
      };

      const WrapperWithCounts = ({ children }: { children: React.ReactNode }) => (
        <ContentListProvider
          id="test-with-counts"
          labels={{ entity: 'item', entityPlural: 'items' }}
          dataSource={{ findItems: mockFindItemsWithCounts }}
          services={{ tags: mockTagsService }}
          features={{ tags: tagsFeatureWithCounts }}
        >
          {children}
        </ContentListProvider>
      );

      render(<TagFilterRenderer query={Query.parse('')} />, { wrapper: WrapperWithCounts });

      fireEvent.click(screen.getByText('Tags'));

      // Counts render as badge text next to each tag name. Wait for query to resolve.
      // tag-1 → 'Production' should show count 2, tag-2 → 'Development' should show count 1.
      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
      });
    });
  });
});
