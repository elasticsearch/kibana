/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ContentListProvider,
  contentListQueryClient,
  type FindItemsResult,
  type FindItemsParams,
} from '@kbn/content-list-provider';
import type { ContentManagementTagsServices } from '@kbn/content-management-tags';
import { ContentListToolbar } from './content_list_toolbar';

const mockFindItems = jest.fn(
  async (_params: FindItemsParams): Promise<FindItemsResult> => ({
    items: [],
    total: 0,
  })
);

const mockTags = [
  { id: 'tag-1', name: 'Production', description: '', color: '#FF0000', managed: false },
  { id: 'tag-2', name: 'Development', description: '', color: '#00FF00', managed: false },
  { id: 'tag-3', name: 'New World', description: '', color: '#0000FF', managed: false },
];

const mockParseSearchQuery = jest.fn((queryText: string) => {
  // Simple mock: extract `tag:Name` and `tag:"Multi Word"` patterns, resolve names
  // to IDs via `mockTags`, and return the remaining text as `searchQuery`.
  // This mirrors the real `parseSearchQueryCore` which resolves names to IDs.
  const tagPattern = /tag:(?:"([^"]+)"|(\S+))/g;
  const resolvedIds: string[] = [];
  let match = tagPattern.exec(queryText);
  while (match) {
    const name = match[1] ?? match[2];
    const tag = mockTags.find((t) => t.name === name);
    if (tag) {
      resolvedIds.push(tag.id);
    }
    match = tagPattern.exec(queryText);
  }
  const searchQuery = queryText.replace(/tag:(?:"[^"]+?"|\S+)\s*/g, '').trim();
  return {
    searchQuery,
    tagIds: resolvedIds.length > 0 ? resolvedIds : undefined,
    tagIdsToExclude: undefined,
  };
});

const mockTagsService: ContentManagementTagsServices = {
  getTagList: () => mockTags,
  parseSearchQuery: mockParseSearchQuery,
};

interface CreateWrapperOptions {
  sortingDisabled?: boolean;
  searchDisabled?: boolean;
  searchPlaceholder?: string;
  sortFields?: Array<{ field: string; name: string }>;
  tagsService?: ContentManagementTagsServices;
}

let providerIdCounter = 0;
const nextProviderId = () => `toolbar-test-list-${++providerIdCounter}`;

const createWrapper = (options: CreateWrapperOptions = {}) => {
  const providerId = nextProviderId();

  return ({ children }: { children: React.ReactNode }) => {
    const { sortingDisabled, searchDisabled, searchPlaceholder, sortFields, tagsService } = options;

    const features = {
      sorting: sortingDisabled ? (false as const) : sortFields ? { fields: sortFields } : true,
      search: searchDisabled ? (false as const) : true,
    };

    return (
      <ContentListProvider
        id={providerId}
        labels={{
          entity: 'dashboard',
          entityPlural: 'dashboards',
          searchPlaceholder,
        }}
        dataSource={{ findItems: mockFindItems }}
        features={features}
        services={tagsService ? { tags: tagsService } : undefined}
      >
        {children}
      </ContentListProvider>
    );
  };
};

describe('ContentListToolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    contentListQueryClient.cancelQueries();
    contentListQueryClient.clear();
  });

  describe('rendering', () => {
    it('renders a search bar once the initial fetch resolves', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      // Phase is 'initialLoad' on first render; the skeleton stands in for
      // the search bar until the first fetch settles.
      expect(await screen.findByTestId('contentListToolbar-searchBox')).toBeInTheDocument();
    });

    it('renders a skeleton during the initialLoad phase', () => {
      // Use a dedicated provider id + never-resolving findItems so phase
      // stays 'initialLoad' long enough to observe the skeleton
      // synchronously. A unique id prevents the shared module-level query
      // cache from replaying a previous test's resolved data here.
      contentListQueryClient.cancelQueries();
      contentListQueryClient.clear();
      const neverResolves = jest.fn(
        (_params: FindItemsParams) => new Promise<FindItemsResult>(() => undefined)
      );

      render(
        <ContentListProvider
          id="toolbar-skeleton-test"
          labels={{ entity: 'dashboard', entityPlural: 'dashboards' }}
          dataSource={{ findItems: neverResolves }}
        >
          <ContentListToolbar />
        </ContentListProvider>
      );

      expect(screen.getByTestId('contentListToolbar-skeleton')).toBeInTheDocument();
    });

    it('applies custom data-test-subj prefix to the search box', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar data-test-subj="my-toolbar" />
        </Wrapper>
      );

      expect(await screen.findByTestId('my-toolbar-searchBox')).toBeInTheDocument();
    });
  });

  describe('search box', () => {
    it('uses the default placeholder when none is configured', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');
      expect(searchBox).toHaveAttribute('placeholder', 'Search\u2026');
    });

    it('renders the search box as enabled by default', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');
      expect(searchBox).not.toBeDisabled();
    });

    it('renders the search box as disabled when search is disabled', async () => {
      const Wrapper = createWrapper({ searchDisabled: true });
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');
      expect(searchBox).toBeDisabled();
    });

    it('calls findItems with search text when user types', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');
      await userEvent.type(searchBox, 'dashboard');

      // Wait for the incremental search to trigger a refetch with the typed text.
      await waitFor(() => {
        const lastCall = mockFindItems.mock.calls[mockFindItems.mock.calls.length - 1];
        expect(lastCall[0].searchQuery).toContain('dashboard');
      });
    });

    it('reflects the search state in the input value', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');
      expect(searchBox).toHaveValue('');

      await userEvent.type(searchBox, 'test query');

      await waitFor(() => {
        expect(searchBox).toHaveValue('test query');
      });
    });

    it('does not crash and remains operable after a parse error', async () => {
      // EuiSearchBar fires onChange with { error, query: null, queryText } when
      // the user types a syntactically invalid query (e.g. an unclosed paren).
      // The handler must NOT pass the raw error text to the controlled `query`
      // prop: EuiSearchBar's getDerivedStateFromProps calls parseQuery on any
      // new prop value and would throw if the string is unparseable, crashing
      // the component. Instead, we return early and let EuiSearchBar maintain
      // the error text in its own internal state.
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');

      // Type a valid query so there is a known good state.
      fireEvent.change(searchBox, { target: { value: 'hello' } });
      await waitFor(() => {
        const lastCall = mockFindItems.mock.calls[mockFindItems.mock.calls.length - 1];
        expect(lastCall[0].searchQuery).toBe('hello');
      });

      // Type a query with a parse error (unclosed paren).
      // EuiSearchBar fires onChange with { error, query: null }; the handler
      // returns early to avoid passing the unparseable string back to the prop.
      fireEvent.change(searchBox, { target: { value: 'hello (unclosed' } });

      // The search bar must still be in the DOM — the component did not crash.
      expect(screen.getByTestId('contentListToolbar-searchBox')).toBeInTheDocument();

      // Subsequent valid typing must continue to work normally.
      fireEvent.change(searchBox, { target: { value: 'hello again' } });
      await waitFor(() => {
        const lastCall = mockFindItems.mock.calls[mockFindItems.mock.calls.length - 1];
        expect(lastCall[0].searchQuery).toBe('hello again');
      });
    });

    it('surfaces parse errors in a visible hint and clears it on recovery', async () => {
      // Reported as https://github.com/elastic/kibana/issues/271705 — the
      // built-in invalid-icon + browser title tooltip is easy to miss, so the
      // toolbar renders a danger-colored hint popover below the input.
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');

      expect(screen.queryByTestId('contentListToolbar-searchParseError')).not.toBeInTheDocument();

      // Typing a special character `[` triggers a parse error in the EUI parser.
      fireEvent.change(searchBox, { target: { value: '[' } });

      const errorMessage = await screen.findByTestId('contentListToolbar-searchParseError');
      expect(errorMessage).toHaveTextContent(/Invalid search:/);

      // Recovering with a valid query clears the hint.
      fireEvent.change(searchBox, { target: { value: 'valid' } });
      await waitFor(() => {
        expect(screen.queryByTestId('contentListToolbar-searchParseError')).not.toBeInTheDocument();
      });
    });

    it('keeps focus in the search box when a parse error appears', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');
      searchBox.focus();
      expect(searchBox).toHaveFocus();

      // Typing a special character `[` triggers a parse error in the EUI parser.
      fireEvent.change(searchBox, { target: { value: '[' } });
      await screen.findByTestId('contentListToolbar-searchParseError');

      // The input must not have been remounted, so focus is retained.
      expect(searchBox).toBeInTheDocument();
      expect(searchBox).toHaveFocus();
    });

    it('uses the configured search placeholder', async () => {
      const Wrapper = createWrapper({ searchPlaceholder: 'Search dashboards...' });
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');
      expect(searchBox).toHaveAttribute('placeholder', 'Search dashboards...');
    });
  });

  describe('sort filter', () => {
    it('renders the sort filter when sorting is enabled', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      expect(await screen.findByTestId('contentListSortRenderer')).toBeInTheDocument();
    });

    it('does not render the sort filter when sorting is disabled', async () => {
      const Wrapper = createWrapper({ sortingDisabled: true });
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      await screen.findByTestId('contentListToolbar-searchBox');
      expect(screen.queryByTestId('contentListSortRenderer')).not.toBeInTheDocument();
    });
  });

  describe('declarative filter children', () => {
    it('renders sort filter from declarative children', async () => {
      const { Filters } = ContentListToolbar;
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <ContentListToolbar>
            <Filters>
              <Filters.Sort />
            </Filters>
          </ContentListToolbar>
        </Wrapper>
      );

      expect(await screen.findByTestId('contentListSortRenderer')).toBeInTheDocument();
    });

    it('falls back to default filter order when Filters has no valid children', async () => {
      const { Filters } = ContentListToolbar;
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <ContentListToolbar>
            <Filters>
              <div>Not a filter</div>
            </Filters>
          </ContentListToolbar>
        </Wrapper>
      );

      // Should still render the sort filter from defaults.
      expect(await screen.findByTestId('contentListSortRenderer')).toBeInTheDocument();
    });

    it('falls back to default filter order when no Filters child provided', async () => {
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <ContentListToolbar>
            <div>Not a Filters component</div>
          </ContentListToolbar>
        </Wrapper>
      );

      expect(await screen.findByTestId('contentListSortRenderer')).toBeInTheDocument();
    });

    it('ignores non-element children (null, strings)', async () => {
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <ContentListToolbar>
            {null}
            {'just a string'}
          </ContentListToolbar>
        </Wrapper>
      );

      // Should fall back to default filters.
      expect(await screen.findByTestId('contentListSortRenderer')).toBeInTheDocument();
    });

    it('resolves Filters wrapped in a Fragment', async () => {
      const { Filters } = ContentListToolbar;
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <ContentListToolbar>
            <>
              <Filters>
                <Filters.Sort />
              </Filters>
            </>
          </ContentListToolbar>
        </Wrapper>
      );

      expect(await screen.findByTestId('contentListSortRenderer')).toBeInTheDocument();
    });
  });

  describe('tag filter integration with query model', () => {
    it('parses tag syntax and passes resolved tag IDs to findItems', async () => {
      const Wrapper = createWrapper({ tagsService: mockTagsService });
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');

      // Use fireEvent.change to set the full query at once, avoiding
      // EuiSearchBar's controlled-component round-trip on intermediate states
      // (e.g., `tag:P` would be unresolvable and clear the input).
      fireEvent.change(searchBox, { target: { value: 'tag:Production my query' } });

      // Verify that `findItems` receives the parsed search query and tag filters.
      // The generic parser uses field definitions (derived from tags service) to
      // resolve "Production" → "tag-1".
      await waitFor(() => {
        const lastCall = mockFindItems.mock.calls[mockFindItems.mock.calls.length - 1];
        expect(lastCall[0].searchQuery).toBe('my query');
        expect(lastCall[0].filters.tag).toEqual({
          include: ['tag-1'],
          exclude: [],
        });
      });
    });

    it('passes search text without tags when no tag syntax is used', async () => {
      const Wrapper = createWrapper({ tagsService: mockTagsService });
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');
      await userEvent.type(searchBox, 'plain search');

      await waitFor(() => {
        const lastCall = mockFindItems.mock.calls[mockFindItems.mock.calls.length - 1];
        expect(lastCall[0].searchQuery).toBe('plain search');
        expect(lastCall[0].filters.tag).toBeUndefined();
      });
    });

    it('falls back to simple search when no tags service is provided', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');
      await userEvent.type(searchBox, 'tag:Production my query');

      // Without tags service, the entire text is treated as the search query.
      await waitFor(() => {
        const lastCall = mockFindItems.mock.calls[mockFindItems.mock.calls.length - 1];
        expect(lastCall[0].searchQuery).toContain('tag:Production my query');
        expect(lastCall[0].filters.tag).toBeUndefined();
      });
    });

    it('parses quoted multi-word tag names and resolves them to IDs', async () => {
      const Wrapper = createWrapper({ tagsService: mockTagsService });
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');
      fireEvent.change(searchBox, { target: { value: 'tag:"New World" my query' } });

      await waitFor(() => {
        const lastCall = mockFindItems.mock.calls[mockFindItems.mock.calls.length - 1];
        expect(lastCall[0].searchQuery).toBe('my query');
        expect(lastCall[0].filters.tag).toEqual({
          include: ['tag-3'],
          exclude: [],
        });
      });
    });

    it('passes unresolvable tag values through as raw filter values', async () => {
      const Wrapper = createWrapper({ tagsService: mockTagsService });
      render(
        <Wrapper>
          <ContentListToolbar />
        </Wrapper>
      );

      const searchBox = await screen.findByTestId('contentListToolbar-searchBox');

      // Set a tag name that doesn't match any known tag.
      fireEvent.change(searchBox, { target: { value: 'tag:Unknown my query' } });

      // The tag clause is still extracted from search text (not leaked as
      // raw `tag:Unknown`). The unresolvable display value is passed through
      // as a raw filter value — it won't match any item but prevents the
      // field syntax from appearing in the free-text search.
      await waitFor(() => {
        const lastCall = mockFindItems.mock.calls[mockFindItems.mock.calls.length - 1];
        expect(lastCall[0].searchQuery).toBe('my query');
        expect(lastCall[0].filters.tag).toEqual({ include: ['Unknown'], exclude: [] });
      });
    });
  });
});
