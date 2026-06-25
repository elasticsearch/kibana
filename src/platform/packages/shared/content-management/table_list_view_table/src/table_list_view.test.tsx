/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiEmptyPrompt } from '@elastic/eui';
import type { TestBed } from '@kbn/test-jest-helpers';
import { registerTestBed } from '@kbn/test-jest-helpers';
import React, { useEffect } from 'react';
import queryString from 'query-string';
import type { Moment } from 'moment';
import moment from 'moment';
import { act } from 'react-dom/test-utils';
import type { ReactWrapper } from 'enzyme';
import type { LocationDescriptor, History } from 'history';
import type { UserContentCommonSchema } from '@kbn/content-management-table-list-view-common';

import { WithServices } from './__jest__';
import { getTagList, localStorageMock } from './mocks';
import { TableListViewTable, type TableListViewTableProps } from './table_list_view_table';
import { getActions } from './table_list_view.test.helpers';
import type { Services } from './services';
import type { CustomSortingOptions } from './components/table_sort_select';

const mockUseEffect = useEffect;

jest.mock('lodash', () => {
  const original = jest.requireActual('lodash');

  return {
    ...original,
    debounce: (handler: () => void) => handler,
  };
});

jest.mock('react-use/lib/useDebounce', () => {
  return (cb: () => void, ms: number, deps: any[]) => {
    mockUseEffect(() => {
      cb();
    }, deps);
  };
});

interface Router {
  history: Partial<History>;
  route: {
    location: LocationDescriptor;
  };
}

const twoDaysAgo = new Date(new Date().setDate(new Date().getDate() - 2));
const twoDaysAgoToString = new Date(twoDaysAgo.getTime()).toDateString();
const yesterday = new Date(new Date().setDate(new Date().getDate() - 1));
const yesterdayToString = new Date(yesterday.getTime()).toDateString();

describe('TableListView', () => {
  const requiredProps: TableListViewTableProps = {
    entityName: 'test',
    entityNamePlural: 'tests',
    initialFilter: '',
    initialPageSize: 20,
    findItems: jest.fn().mockResolvedValue({ total: 0, hits: [] }),
    getDetailViewLink: () => 'http://elastic.co',
    urlStateEnabled: false,
    onFetchSuccess: () => {},
    tableCaption: 'my caption',
    setPageDataTestSubject: () => {},
  };

  beforeAll(() => {
    jest.useFakeTimers({ legacyFakeTimers: true });
  });

  beforeEach(() => {
    localStorage.clear();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const setup = (
    propsOverride?: Partial<TableListViewTableProps>,
    serviceOverride?: Partial<Services>
  ) =>
    registerTestBed<string, TableListViewTableProps>(
      WithServices<TableListViewTableProps>(TableListViewTable, serviceOverride),
      {
        defaultProps: { ...requiredProps },
        memoryRouter: { wrapComponent: true },
      }
    )(propsOverride);

  describe('empty prompt', () => {
    test('render default empty prompt', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setup();
      });

      const { component, exists } = testBed!;
      component.update();

      expect(component.find(EuiEmptyPrompt).length).toBe(1);
      expect(exists('newItemButton')).toBe(false);
    });

    // avoid trapping users in empty prompt that can not create new items
    test('render default empty prompt with create action when createItem supplied', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setup({ createItem: () => undefined });
      });

      const { component, exists } = testBed!;
      component.update();

      expect(component.find(EuiEmptyPrompt).length).toBe(1);
      expect(exists('newItemButton')).toBe(true);
    });

    test('render custom empty prompt', async () => {
      let testBed: TestBed;

      const CustomEmptyPrompt = () => {
        return <EuiEmptyPrompt data-test-subj="custom-empty-prompt" title={<h1>Table empty</h1>} />;
      };

      await act(async () => {
        testBed = await setup({ emptyPrompt: <CustomEmptyPrompt /> });
      });

      const { component, exists } = testBed!;
      component.update();

      expect(exists('custom-empty-prompt')).toBe(true);
    });

    test('render empty prompt after deleting all items from table', async () => {
      // NOTE: this test is using helpers that are being tested in the
      // "should allow select items to be deleted" test below.
      // If this test fails, check that one first.

      const hits: UserContentCommonSchema[] = [
        {
          id: 'item-1',
          type: 'dashboard',
          updatedAt: '2020-01-01T00:00:00Z',
          attributes: {
            title: 'Item 1',
          },
          references: [],
        },
      ];

      const findItems = jest.fn().mockResolvedValue({ total: 1, hits });
      const deleteItems = jest.fn();

      let testBed: TestBed;

      const EmptyPrompt = () => {
        return <EuiEmptyPrompt data-test-subj="custom-empty-prompt" title={<h1>Table empty</h1>} />;
      };

      await act(async () => {
        testBed = await setup({ emptyPrompt: <EmptyPrompt />, findItems, deleteItems });
      });

      const { component, exists, table } = testBed!;
      const { selectRow, clickConfirmModalButton, clickDeleteSelectedItemsButton } = getActions(
        testBed!
      );
      component.update();

      expect(exists('custom-empty-prompt')).toBe(false);
      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');
      const [row] = tableCellsValues;
      expect(row[1]).toBe('Item 1'); // Note: row[0] is the checkbox

      // We delete the item in the table and expect the empty prompt to show
      findItems.mockResolvedValue({ total: 0, hits: [] });
      selectRow('item-1');
      clickDeleteSelectedItemsButton();
      await clickConfirmModalButton();

      expect(exists('custom-empty-prompt')).toBe(true);
    });
  });

  describe('default columns', () => {
    const hits: UserContentCommonSchema[] = [
      {
        id: '123',
        updatedAt: twoDaysAgo.toISOString(),
        type: 'dashboard',
        attributes: {
          title: 'Item 1',
          description: 'Item 1 description',
        },
        references: [],
      },
      {
        id: '456',
        // This is the latest updated and should come first in the table
        updatedAt: yesterday.toISOString(),
        type: 'dashboard',
        attributes: {
          title: 'Item 2',
          description: 'Item 2 description',
        },
        references: [],
      },
    ];

    test('should add a "Last updated" column if "updatedAt" is provided', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setup({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });

      const { component, table } = testBed!;
      component.update();

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['Item 2Item 2 description', yesterdayToString], // Comes first as it is the latest updated
        ['Item 1Item 1 description', twoDaysAgoToString],
      ]);
    });

    test('should not display relative time for items updated more than 7 days ago', async () => {
      let testBed: TestBed;

      const updatedAtValues: Moment[] = [];

      const updatedHits = hits.map(({ id, attributes, references }, i) => {
        const updatedAt = moment().subtract(7 + i, 'days');
        updatedAtValues.push(updatedAt);

        return {
          id,
          updatedAt,
          attributes,
          references,
        };
      });

      await act(async () => {
        testBed = await setup({
          findItems: jest.fn().mockResolvedValue({
            total: updatedHits.length,
            hits: updatedHits,
          }),
        });
      });

      const { component, table } = testBed!;
      component.update();

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        // Renders the datetime with this format: "July 28, 2022"
        ['Item 1Item 1 description', updatedAtValues[0].format('ll')],
        ['Item 2Item 2 description', updatedAtValues[1].format('ll')],
      ]);
    });

    test('should not add a "Last updated" column if no "updatedAt" is provided', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setup({
          findItems: jest.fn().mockResolvedValue({
            total: hits.length,
            // Not including the "updatedAt" metadata
            hits: hits.map(({ attributes, references }) => ({ attributes, references })),
          }),
        });
      });

      const { component, table } = testBed!;
      component.update();

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['Item 1Item 1 description'], // Sorted by title
        ['Item 2Item 2 description'],
      ]);
    });

    test('should not display anything if there is no updatedAt metadata for an item', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setup({
          findItems: jest.fn().mockResolvedValue({
            total: hits.length + 1,
            hits: [
              ...hits,
              {
                id: '789',
                attributes: { title: 'Item 3', description: 'Item 3 description' },
                references: [],
              },
            ],
          }),
        });
      });

      const { component, table } = testBed!;
      component.update();

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['Item 2Item 2 description', yesterdayToString],
        ['Item 1Item 1 description', twoDaysAgoToString],
        ['Item 3Item 3 description', '-'], // Empty column as no updatedAt provided
      ]);
    });
  });

  describe('pagination', () => {
    const initialPageSize = 20;
    const totalItems = 30;
    const updatedAt = new Date().toISOString();

    beforeEach(() => {
      Object.defineProperty(window, 'localStorage', {
        value: localStorageMock(),
      });
    });

    const hits: UserContentCommonSchema[] = [...Array(totalItems)].map((_, i) => ({
      id: `item${i}`,
      type: 'dashboard',
      updatedAt,
      attributes: {
        title: `Item ${i < 10 ? `0${i}` : i}`, // prefix with "0" for correct A-Z sorting
      },
      references: [],
    }));

    test('should limit the number of row to the `initialPageSize` provided', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setup({
          initialPageSize,
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] }),
        });
      });

      const { component, table } = testBed!;
      component.update();

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');
      expect(tableCellsValues.length).toBe(requiredProps.initialPageSize);

      const [[firstRowTitle]] = tableCellsValues;
      const [lastRowTitle] = tableCellsValues[tableCellsValues.length - 1];

      expect(firstRowTitle).toBe('Item 00');
      expect(lastRowTitle).toBe('Item 19');
    });

    test('should allow changing the number of rows in the table', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setup({
          initialPageSize,
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] }),
        });
      });

      const { component, table, find } = testBed!;
      component.update();

      let { tableCellsValues } = table.getMetaData('listingTable-isLoaded');
      expect(tableCellsValues.length).toBe(requiredProps.initialPageSize);

      // Changing the "Rows per page" also sends the "sort" column information and thus updates the sorting.
      // We test that the "sort by" column has not changed before and after changing the number of rows
      expect(find('tableSortSelectBtn').at(0).text()).toBe('Recent-Old');

      // Open the "Rows per page" drop down
      find('tablePaginationPopoverButton').simulate('click');
      find('tablePagination-10-rows').simulate('click');

      ({ tableCellsValues } = table.getMetaData('listingTable-isLoaded'));
      expect(tableCellsValues.length).toBe(10);

      expect(find('tableSortSelectBtn').at(0).text()).toBe('Recent-Old'); // Still the same
    });

    test('should navigate to page 2', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setup({
          initialPageSize,
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] }),
        });
      });

      const { component, table } = testBed!;
      component.update();

      const pageLinks = component.find('.euiPagination__list .euiPagination__item');
      expect(pageLinks.length).toBe(Math.ceil(totalItems / initialPageSize));

      act(() => {
        // Click on page 2
        pageLinks.at(1).find('a').simulate('click');
      });
      component.update();

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');
      expect(tableCellsValues.length).toBe(totalItems - initialPageSize);

      const [[firstRowTitle]] = tableCellsValues;
      const [lastRowTitle] = tableCellsValues[tableCellsValues.length - 1];

      expect(firstRowTitle).toBe('Item 20');
      expect(lastRowTitle).toBe('Item 29');
    });

    test('should persist the number of rows in the table', async () => {
      let testBed: TestBed;

      const tableId = 'myTable';

      await act(async () => {
        testBed = await setup({
          initialPageSize,
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] }),
          id: tableId,
        });
      });

      {
        const { component, table, find } = testBed!;
        component.update();

        const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');
        expect(tableCellsValues.length).toBe(20); // 20 by default

        let storageValue = localStorage.getItem(`tablePersist:${tableId}`);
        expect(storageValue).toBe(null);

        find('tablePaginationPopoverButton').simulate('click');
        find('tablePagination-10-rows').simulate('click');

        storageValue = localStorage.getItem(`tablePersist:${tableId}`);
        expect(storageValue).not.toBe(null);
        expect(JSON.parse(storageValue!).pageSize).toBe(10);
      }

      // Mount a second table and verify that is shows only 10 rows
      {
        await act(async () => {
          testBed = await setup({
            initialPageSize,
            findItems: jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] }),
            id: tableId,
          });
        });

        const { component, table } = testBed!;
        component.update();
        const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');
        expect(tableCellsValues.length).toBe(10); // 10 items this time
      }
    });
  });

  describe('column sorting', () => {
    const setupColumnSorting = registerTestBed<string, TableListViewTableProps>(
      WithServices<TableListViewTableProps>(TableListViewTable, {
        TagList: getTagList({ references: [] }),
      }),
      {
        defaultProps: { ...requiredProps },
        memoryRouter: { wrapComponent: true },
      }
    );

    const hits: UserContentCommonSchema[] = [
      {
        id: '123',
        updatedAt: twoDaysAgo.toISOString(), // first asc, last desc
        type: 'dashboard',
        attributes: {
          title: 'z-foo', // first desc, last asc
        },
        references: [{ id: 'id-tag-1', name: 'tag-1', type: 'tag' }],
      },
      {
        id: '456',
        updatedAt: yesterday.toISOString(), // first desc, last asc
        type: 'dashboard',
        attributes: {
          title: 'a-foo', // first asc, last desc
        },
        references: [],
      },
    ];

    test('should initially sort by "Last updated" column', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setupColumnSorting({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });

      const { component, table } = testBed!;
      component.update();

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['a-foo', yesterdayToString],
        ['z-foo', twoDaysAgoToString],
      ]);
    });

    test('filter select should have 4 options', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setupColumnSorting({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });
      const { openSortSelect } = getActions(testBed!);
      const { component, find } = testBed!;
      component.update();

      act(() => {
        openSortSelect();
      });
      component.update();

      const filterOptions = find('sortSelect').find('li');

      expect(filterOptions.length).toBe(4);
      expect(filterOptions.map((wrapper) => wrapper.text())).toEqual([
        'A-Z',
        'Z-A',
        'Recent-Old. Checked option.',
        'Old-Recent',
      ]);
    });

    test('filter select should change the sort order and remember the order', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setupColumnSorting({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });

      let { component, table, find } = testBed!;
      const { openSortSelect } = getActions(testBed!);
      component.update();

      let { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['a-foo', yesterdayToString],
        ['z-foo', twoDaysAgoToString],
      ]);

      act(() => {
        openSortSelect();
      });
      component.update();
      const filterOptions = find('sortSelect').find('li');

      // Check that the second option is 'Z-A'
      expect(filterOptions.at(1).text()).toBe('Z-A');

      // Click 'Z-A'
      act(() => {
        filterOptions.at(1).simulate('click');
      });
      component.update();

      ({ tableCellsValues } = table.getMetaData('listingTable-isLoaded'));

      expect(tableCellsValues).toEqual([
        ['z-foo', twoDaysAgoToString],
        ['a-foo', yesterdayToString],
      ]);

      expect(localStorage.getItem('tableSort:test')).toBe(
        '{"field":"attributes.title","direction":"desc"}'
      );

      component.unmount();
      await act(async () => {
        testBed = await setupColumnSorting({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });

      ({ component, table, find } = testBed!);
      component.update();
      ({ tableCellsValues } = table.getMetaData('listingTable-isLoaded'));

      expect(tableCellsValues).toEqual([
        ['z-foo', twoDaysAgoToString],
        ['a-foo', yesterdayToString],
      ]);
    });

    test('should update the select option when toggling the column header', async () => {
      const getTableColumnSortButton = (testBed: TestBed, text: string) => {
        const buttons = testBed.find('tableHeaderSortButton');
        let wrapper: ReactWrapper | undefined;

        buttons.forEach((_wrapper) => {
          if (wrapper) {
            return;
          }

          if (_wrapper.text().includes(text)) {
            wrapper = _wrapper;
          }
        });
        return wrapper;
      };

      let testBed: TestBed;

      await act(async () => {
        testBed = await setupColumnSorting({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });

      const { component, table, find } = testBed!;
      const { openSortSelect } = getActions(testBed!);
      component.update();

      act(() => {
        openSortSelect();
      });
      component.update();
      let filterOptions = find('sortSelect').find('li');
      expect(filterOptions.map((wrapper) => wrapper.text())).toEqual([
        'A-Z',
        'Z-A',
        'Recent-Old. Checked option.', // checked
        'Old-Recent',
      ]);

      const nameColumnHeaderButton = getTableColumnSortButton(testBed!, 'Name');
      if (!nameColumnHeaderButton) {
        throw new Error('Could not find table header button containing "Name".');
      }

      act(() => {
        nameColumnHeaderButton.simulate('click');
      });
      component.update();
      let { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['a-foo', yesterdayToString],
        ['z-foo', twoDaysAgoToString],
      ]);

      act(() => {
        nameColumnHeaderButton.simulate('click');
      });
      component.update();
      ({ tableCellsValues } = table.getMetaData('listingTable-isLoaded'));

      expect(tableCellsValues).toEqual([
        ['z-foo', twoDaysAgoToString],
        ['a-foo', yesterdayToString],
      ]);

      act(() => {
        openSortSelect();
      });
      component.update();
      filterOptions = find('sortSelect').find('li');

      expect(filterOptions.map((wrapper) => wrapper.text())).toEqual([
        'A-Z',
        'Z-A. Checked option.', // now this option is checked
        'Recent-Old',
        'Old-Recent',
      ]);
    });
  });

  describe('column sorting with custom columns', () => {
    const customSortingOptions: CustomSortingOptions = {
      field: 'typeTitle',
      sortingLabels: [
        {
          label: 'Type A-Z',
          direction: 'asc',
        },
        {
          label: 'Type Z-A',
          direction: 'desc',
        },
      ],
    };
    const customTableColumn = {
      field: 'typeTitle',
      name: 'Type',
      sortable: true,
    };

    const setupCustomColumnSorting = registerTestBed<string, TableListViewTableProps>(
      WithServices<TableListViewTableProps>(TableListViewTable, {
        TagList: getTagList({ references: [] }),
      }),
      {
        defaultProps: { ...requiredProps, customSortingOptions, customTableColumn },
      }
    );

    const hits: Array<UserContentCommonSchema & { typeTitle: string }> = [
      {
        id: '123',
        updatedAt: twoDaysAgo.toISOString(),
        type: 'maps',
        attributes: {
          title: 'Item 2',
        },
        references: [],
        typeTitle: 'Vega',
      },
      {
        id: '456',
        updatedAt: yesterday.toISOString(),
        type: 'vega',
        attributes: {
          title: 'Item 1',
        },
        references: [],
        typeTitle: 'Lens',
      },
    ];

    test('filter select should change the sort order based on custom select option', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setupCustomColumnSorting({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });

      let { component, table, find } = testBed!;
      const { openSortSelect } = getActions(testBed!);
      component.update();

      let { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['Item 1', 'Lens', yesterdayToString],
        ['Item 2', 'Vega', twoDaysAgoToString],
      ]);

      act(() => {
        openSortSelect();
      });
      component.update();
      const filterOptions = find('sortSelect').find('li');

      // Check that the fourth option is 'Type Z-A'
      expect(filterOptions.at(3).text()).toBe('Type Z-A');

      // Click 'Type Z-A'
      act(() => {
        filterOptions.at(3).simulate('click');
      });
      component.update();

      ({ tableCellsValues } = table.getMetaData('listingTable-isLoaded'));

      expect(tableCellsValues).toEqual([
        ['Item 2', 'Vega', twoDaysAgoToString],
        ['Item 1', 'Lens', yesterdayToString],
      ]);

      expect(localStorage.getItem('tableSort:test')).toBe(
        '{"field":"typeTitle","direction":"desc"}'
      );

      component.unmount();
      await act(async () => {
        testBed = await setupCustomColumnSorting({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });

      ({ component, table, find } = testBed!);
      component.update();
      ({ tableCellsValues } = table.getMetaData('listingTable-isLoaded'));

      expect(tableCellsValues).toEqual([
        ['Item 2', 'Vega', twoDaysAgoToString],
        ['Item 1', 'Lens', yesterdayToString],
      ]);
    });

    test('should update the select option when custom column header is selected', async () => {
      const getCustomTableColumnSortButton = (testBed: TestBed, text: string) => {
        const buttons = testBed.find('tableHeaderSortButton');
        let wrapper: ReactWrapper | undefined;

        buttons.forEach((_wrapper) => {
          if (wrapper) {
            return;
          }

          if (_wrapper.text().includes(text)) {
            wrapper = _wrapper;
          }
        });
        return wrapper;
      };

      let testBed: TestBed;

      await act(async () => {
        testBed = await setupCustomColumnSorting({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });

      const { component, table, find } = testBed!;
      const { openSortSelect } = getActions(testBed!);
      component.update();

      act(() => {
        openSortSelect();
      });
      component.update();
      let filterOptions = find('sortSelect').find('li');

      expect(filterOptions.length).toBe(6);
      expect(filterOptions.map((wrapper) => wrapper.text())).toEqual([
        'A-Z',
        'Z-A',
        'Type A-Z',
        'Type Z-A',
        'Recent-Old. Checked option.',
        'Old-Recent',
      ]);

      const typeColumnHeaderButton = getCustomTableColumnSortButton(testBed!, 'Type');

      if (!typeColumnHeaderButton) {
        throw new Error('Could not find table header button containing "Type".');
      }

      act(() => {
        typeColumnHeaderButton.simulate('click');
      });
      component.update();

      let { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['Item 1', 'Lens', yesterdayToString],
        ['Item 2', 'Vega', twoDaysAgoToString],
      ]);

      act(() => {
        typeColumnHeaderButton.simulate('click');
      });
      component.update();
      ({ tableCellsValues } = table.getMetaData('listingTable-isLoaded'));

      expect(tableCellsValues).toEqual([
        ['Item 2', 'Vega', twoDaysAgoToString],
        ['Item 1', 'Lens', yesterdayToString],
      ]);

      act(() => {
        openSortSelect();
      });
      component.update();

      filterOptions = find('sortSelect').find('li');

      expect(filterOptions.map((wrapper) => wrapper.text())).toEqual([
        'A-Z',
        'Z-A',
        'Type A-Z',
        'Type Z-A. Checked option.',
        'Recent-Old',
        'Old-Recent',
      ]);
    });
  });

  describe('column sorting with recently accessed', () => {
    const setupColumnSorting = registerTestBed<string, TableListViewTableProps>(
      WithServices<TableListViewTableProps>(TableListViewTable, {
        TagList: getTagList({ references: [] }),
      }),
      {
        defaultProps: {
          ...requiredProps,
          recentlyAccessed: { get: () => [{ id: '123', link: '', label: '' }] },
        },
        memoryRouter: { wrapComponent: true },
      }
    );

    const hits: UserContentCommonSchema[] = [
      {
        id: '123',
        updatedAt: twoDaysAgo.toISOString(), // first asc, last desc
        type: 'dashboard',
        attributes: {
          title: 'z-foo', // first desc, last asc
        },
        references: [{ id: 'id-tag-1', name: 'tag-1', type: 'tag' }],
      },
      {
        id: '456',
        updatedAt: yesterday.toISOString(), // first desc, last asc
        type: 'dashboard',
        attributes: {
          title: 'a-foo', // first asc, last desc
        },
        references: [],
      },
    ];

    test('should initially sort by "Recently Accessed"', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setupColumnSorting({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });

      const { component, table } = testBed!;
      component.update();

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['z-foo', twoDaysAgoToString],
        ['a-foo', yesterdayToString],
      ]);
    });

    test('filter select should have 5 options', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setupColumnSorting({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
        });
      });
      const { openSortSelect } = getActions(testBed!);
      const { component, find } = testBed!;
      component.update();

      act(() => {
        openSortSelect();
      });
      component.update();

      const filterOptions = find('sortSelect').find('li');

      expect(filterOptions.length).toBe(5);
      expect(filterOptions.map((wrapper) => wrapper.text())).toEqual([
        'Recently viewed. Checked option.Additional information',
        'A-Z',
        'Z-A',
        'Recent-Old',
        'Old-Recent',
      ]);
    });
  });

  describe('content editor', () => {
    const setupInspector = registerTestBed<string, TableListViewTableProps>(
      WithServices<TableListViewTableProps>(TableListViewTable),
      {
        defaultProps: { ...requiredProps },
        memoryRouter: { wrapComponent: true },
      }
    );

    const hits: UserContentCommonSchema[] = [
      {
        id: '123',
        updatedAt: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
        attributes: {
          title: 'Item 1',
          description: 'Item 1 description',
        },
        references: [],
        type: 'dashboard',
      },
      {
        id: '456',
        updatedAt: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString(),
        attributes: {
          title: 'Item 2',
          description: 'Item 2 description',
        },
        references: [],
        type: 'dashboard',
      },
    ];

    test('should have an "inpect" button if the content editor is enabled', async () => {
      let testBed: TestBed;

      await act(async () => {
        testBed = await setupInspector({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
          contentEditor: { enabled: true },
        });
      });

      const { component, table } = testBed!;
      component.update();

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');
      expect(tableCellsValues[0][2]).toBe('View Item 1 details');
      expect(tableCellsValues[1][2]).toBe('View Item 2 details');
    });
  });

  describe('tag filtering', () => {
    const setupTagFiltering = registerTestBed<string, TableListViewTableProps>(
      WithServices<TableListViewTableProps>(TableListViewTable, {
        getTagList: () => [
          {
            id: 'id-tag-1',
            name: 'tag-1',
            type: 'tag',
            description: '',
            color: '',
            managed: false,
          },
          {
            id: 'id-tag-2',
            name: 'tag-2',
            type: 'tag',
            description: '',
            color: '',
            managed: false,
          },
          {
            id: 'id-tag-3',
            name: 'tag-3',
            type: 'tag',
            description: '',
            color: '',
            managed: false,
          },
          {
            id: 'id-tag-4',
            name: 'tag-4',
            type: 'tag',
            description: '',
            color: '',
            managed: false,
          },
        ],
      }),
      {
        defaultProps: { ...requiredProps },
        memoryRouter: { wrapComponent: true },
      }
    );

    const hits: UserContentCommonSchema[] = [
      {
        id: '123',
        updatedAt: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
        type: 'dashboard',
        attributes: {
          title: 'Item 1',
          description: 'Item 1 description',
        },
        references: [
          { id: 'id-tag-1', name: 'tag-1', type: 'tag' },
          { id: 'id-tag-2', name: 'tag-2', type: 'tag' },
        ],
      },
      {
        id: '456',
        updatedAt: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString(),
        type: 'dashboard',
        attributes: {
          title: 'Item 2',
          description: 'Item 2 description',
        },
        references: [],
      },
    ];

    test('should filter by tag from the table', async () => {
      let testBed: TestBed;

      const findItems = jest.fn().mockResolvedValue({ total: hits.length, hits });

      await act(async () => {
        testBed = await setupTagFiltering({
          findItems,
        });
      });

      const { component, table, find, exists } = testBed!;
      component.update();

      expect(exists('tagFilterPopoverButton')).toBe(true);

      const getSearchBoxValue = () => find('tableListSearchBox').props().defaultValue;

      const getLastCallArgsFromFindItems = () =>
        findItems.mock.calls[findItems.mock.calls.length - 1];

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');
      // "tag-1" and "tag-2" are rendered in the column
      expect(tableCellsValues[0][0]).toBe('Item 1Item 1 descriptiontag-1tag-2');

      await act(async () => {
        find('tag-id-tag-1').simulate('click');
      });
      component.update();

      // The search bar should be updated
      let expected = 'tag:(tag-1)';
      let [searchTerm] = getLastCallArgsFromFindItems();
      expect(getSearchBoxValue()).toBe(expected);
      expect(searchTerm).toBe(expected);

      await act(async () => {
        find('tag-id-tag-2').simulate('click');
      });
      component.update();

      expected = 'tag:(tag-1 or tag-2)';
      [searchTerm] = getLastCallArgsFromFindItems();
      expect(getSearchBoxValue()).toBe(expected);
      expect(searchTerm).toBe(expected);

      // Ctrl + click on a tag
      await act(async () => {
        find('tag-id-tag-2').simulate('click', { ctrlKey: true });
      });
      component.update();

      expected = 'tag:(tag-1) -tag:(tag-2)';
      [searchTerm] = getLastCallArgsFromFindItems();
      expect(getSearchBoxValue()).toBe(expected);
      expect(searchTerm).toBe(expected);
    });

    test('should filter by tag from the search bar filter', async () => {
      let testBed: TestBed;
      const findItems = jest.fn().mockResolvedValue({ total: hits.length, hits });

      await act(async () => {
        testBed = await setupTagFiltering({
          findItems,
        });
      });

      const { component, find, exists } = testBed!;
      component.update();

      const getSearchBoxValue = () => find('tableListSearchBox').props().defaultValue;

      const getLastCallArgsFromFindItems = () =>
        findItems.mock.calls[findItems.mock.calls.length - 1];

      const openTagFilterDropdown = async () => {
        await act(async () => {
          find('tagFilterPopoverButton').simulate('click');
        });
        component.update();
      };

      await openTagFilterDropdown();

      expect(exists('tagSelectableList')).toBe(true);
      await act(async () => {
        find('tag-searchbar-option-tag-1').simulate('click');
      });
      component.update();

      // The search bar should be updated and search term sent to the findItems() handler
      let expected = 'tag:(tag-1)';
      let [searchTerm] = getLastCallArgsFromFindItems();
      expect(getSearchBoxValue()).toBe(expected);
      expect(searchTerm).toBe(expected);

      // Ctrl + click one item
      await act(async () => {
        find('tag-searchbar-option-tag-2').simulate('click', { ctrlKey: true });
      });
      component.update();

      expected = 'tag:(tag-1) -tag:(tag-2)';
      [searchTerm] = getLastCallArgsFromFindItems();
      expect(getSearchBoxValue()).toBe(expected);
      expect(searchTerm).toBe(expected);
    });

    test('should not have the tag filter if tagging is disabled', async () => {
      let testBed: TestBed;
      const findItems = jest.fn().mockResolvedValue({ total: hits.length, hits });

      await act(async () => {
        testBed = await setup(
          {
            findItems,
          },
          { isTaggingEnabled: () => false }
        );
      });

      const { component, exists } = testBed!;
      component.update();

      expect(exists('tagFilterPopoverButton')).toBe(false);
    });
  });

  describe('initialFilter', () => {
    const setupInitialFilter = registerTestBed<string, TableListViewTableProps>(
      WithServices<TableListViewTableProps>(TableListViewTable, {
        getTagList: () => [
          {
            id: 'id-tag-foo',
            name: 'foo',
            type: 'tag',
            description: '',
            color: '',
            managed: false,
          },
        ],
      }),
      {
        defaultProps: { ...requiredProps },
        memoryRouter: { wrapComponent: true },
      }
    );

    test('should filter by tag passed as in initialFilter prop', async () => {
      let testBed: TestBed;

      const initialFilter = 'tag:(tag-1)';
      const findItems = jest.fn().mockResolvedValue({
        total: 1,
        hits: [
          {
            id: 'item-1',
            type: 'dashboard',
            updatedAt: new Date('2023-07-15').toISOString(),
            attributes: {
              title: 'Item 1',
            },
            references: [],
          },
        ],
      });

      await act(async () => {
        testBed = await setupInitialFilter({
          findItems,
          initialFilter,
          urlStateEnabled: false,
        });
      });

      const { component, find } = testBed!;
      component.update();

      const getSearchBoxValue = () => find('tableListSearchBox').props().defaultValue;

      const getLastCallArgsFromFindItems = () =>
        findItems.mock.calls[findItems.mock.calls.length - 1];

      // The search bar should be updated
      const expected = initialFilter;
      const [searchTerm] = getLastCallArgsFromFindItems();
      expect(getSearchBoxValue()).toBe(expected);
      expect(searchTerm).toBe(expected);
    });
  });

  describe('search', () => {
    const updatedAt = moment('2023-07-15').toISOString();

    const hits: UserContentCommonSchema[] = [
      {
        id: 'item-1',
        type: 'dashboard',
        updatedAt,
        attributes: {
          title: 'Item 1',
        },
        references: [],
      },
      {
        id: 'item-2',
        type: 'dashboard',
        updatedAt,
        attributes: {
          title: 'Item 2',
        },
        references: [],
      },
    ];

    const findItems = jest.fn();

    const setupSearch = async (...args: Parameters<ReturnType<typeof registerTestBed>>) => {
      let testBed: TestBed;

      await act(async () => {
        testBed = registerTestBed<string, TableListViewTableProps>(
          WithServices<TableListViewTableProps>(TableListViewTable),
          {
            defaultProps: {
              ...requiredProps,
              findItems,
              urlStateEnabled: false,
              entityName: 'Foo',
              entityNamePlural: 'Foos',
            },
            memoryRouter: { wrapComponent: true },
          }
        )(...args);
      });

      const { updateSearchText, getSearchBoxValue } = getActions(testBed!);

      return {
        testBed: testBed!,
        updateSearchText,
        getSearchBoxValue,
        getLastCallArgsFromFindItems: () => findItems.mock.calls[findItems.mock.calls.length - 1],
      };
    };

    beforeEach(() => {
      findItems.mockReset().mockResolvedValue({ total: hits.length, hits });
    });

    test('should search the table items', async () => {
      const { testBed, getLastCallArgsFromFindItems, getSearchBoxValue, updateSearchText } =
        await setupSearch();

      const { component, table } = testBed!;
      component.update();

      let searchTerm = '';
      let expected = '';
      [searchTerm] = getLastCallArgsFromFindItems!();
      expect(getSearchBoxValue!()).toBe(expected);
      expect(searchTerm).toBe(expected);

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');
      expect(tableCellsValues).toMatchInlineSnapshot(`
        Array [
          Array [
            "Item 1",
            "Jul 15, 2023",
          ],
          Array [
            "Item 2",
            "Jul 15, 2023",
          ],
        ]
      `);

      findItems.mockResolvedValueOnce({
        total: 1,
        hits: [
          {
            id: 'item-from-search',
            type: 'dashboard',
            updatedAt: moment('2023-07-01').toISOString(),
            attributes: {
              title: 'Item from search',
            },
            references: [],
          },
        ],
      });

      expected = 'foo';
      await updateSearchText!(expected);
      [searchTerm] = getLastCallArgsFromFindItems!();
      expect(getSearchBoxValue!()).toBe(expected);
      expect(searchTerm).toBe(expected);

      expect(table.getMetaData('listingTable-isLoaded').tableCellsValues).toMatchInlineSnapshot(`
        Array [
          Array [
            "Item from search",
            "Jul 1, 2023",
          ],
        ]
      `);
    });

    test('should search and render empty list if no result', async () => {
      const { testBed, updateSearchText } = await setupSearch();

      const { component, table, find } = testBed!;
      component.update();

      findItems.mockResolvedValueOnce({
        total: 0,
        hits: [],
      });

      await updateSearchText!('unknown items');

      expect(table.getMetaData('listingTable-isLoaded').tableCellsValues).toMatchInlineSnapshot(`
        Array [
          Array [
            "No Foos matched your search.",
          ],
        ]
      `);

      await act(async () => {
        find('clearSearchButton').simulate('click');
      });
      component.update();

      // We should get back the initial 2 items (Item 1 and Item 2)
      expect(table.getMetaData('listingTable-isLoaded').tableCellsValues).toMatchInlineSnapshot(`
        Array [
          Array [
            "Item 1",
            "Jul 15, 2023",
          ],
          Array [
            "Item 2",
            "Jul 15, 2023",
          ],
        ]
      `);
    });

    test('should show error hint when inserting invalid chars', async () => {
      const { testBed, getLastCallArgsFromFindItems, getSearchBoxValue, updateSearchText } =
        await setupSearch();

      const { component, exists } = testBed;
      component.update();

      expect(exists('forbiddenCharErrorMessage')).toBe(false);

      const expected = '[foo';
      await updateSearchText!(expected);
      expect(getSearchBoxValue!()).toBe(expected);

      expect(exists('forbiddenCharErrorMessage')).toBe(true); // hint is shown

      const [searchTerm] = getLastCallArgsFromFindItems!();
      expect(searchTerm).toBe(''); // no search has been made
    });
  });

  describe('url state', () => {
    let router: Router | undefined;

    const setupInitialUrl = (initialSearchQuery: string = '') =>
      registerTestBed<string, TableListViewTableProps>(
        WithServices<TableListViewTableProps>(TableListViewTable, {
          getTagList: () => [
            {
              id: 'id-tag-1',
              name: 'tag-1',
              type: 'tag',
              description: '',
              color: '',
              managed: false,
            },
            {
              id: 'id-tag-2',
              name: 'tag-2',
              type: 'tag',
              description: '',
              color: '',
              managed: false,
            },
          ],
        }),
        {
          defaultProps: { ...requiredProps, urlStateEnabled: true },
          memoryRouter: {
            wrapComponent: true,
            initialEntries: [{ search: initialSearchQuery }],
            onRouter: (_router: Router) => {
              router = _router;
            },
          },
        }
      );

    const setupTagFiltering = setupInitialUrl();

    const hits: UserContentCommonSchema[] = [
      {
        id: '123',
        updatedAt: yesterday.toISOString(),
        type: 'dashboard',
        attributes: {
          title: 'Item 1',
          description: '',
        },
        references: [{ id: 'id-tag-1', name: 'tag-1', type: 'tag' }],
      },
      {
        id: '456',
        updatedAt: twoDaysAgo.toISOString(),
        type: 'dashboard',
        attributes: {
          title: 'Item 2',
          description: '',
        },
        references: [{ id: 'id-tag-2', name: 'tag-2', type: 'tag' }],
      },
    ];

    test('should read the initial search term from URL', async () => {
      let testBed: TestBed;

      const findItems = jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] });

      await act(async () => {
        testBed = await setupInitialUrl('?s=hello')({
          findItems,
        });
      });

      const { component, find } = testBed!;
      component.update();

      const getSearchBoxValue = () => find('tableListSearchBox').props().defaultValue;

      // Start with empty search box
      expect(getSearchBoxValue()).toBe('hello');
      expect(router?.history.location?.search).toBe('?s=hello');

      // Change the URL
      await act(async () => {
        if (router?.history.push) {
          router.history.push({
            search: `?${queryString.stringify({ s: '' }, { encode: false })}`,
          });
        }
      });

      component.update();

      // Search box is not updated
      expect(getSearchBoxValue()).toBe('hello');
      expect(router?.history.location?.search).toBe('?s=');
    });

    test('should update the URL when changing the search term', async () => {
      let testBed: TestBed;

      const findItems = jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] });

      await act(async () => {
        testBed = await setupTagFiltering({
          findItems,
        });
      });

      const { component, find } = testBed!;
      component.update();

      // Enter new search term in box
      await act(async () => {
        find('tableListSearchBox').simulate('keyup', {
          key: 'Enter',
          target: { value: 'search-changed' },
        });
      });
      component.update();

      expect(router?.history.location?.search).toBe('?s=search-changed');
    });

    test('should filter by initial tag from the URL', async () => {
      let testBed: TestBed;

      const findItems = jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] });

      await act(async () => {
        testBed = await setupInitialUrl(
          `?${queryString.stringify({ s: 'tag:(tag-2)' }, { encode: false })}`
        )({
          findItems,
        });
      });

      const { component, find } = testBed!;
      component.update();

      const getLastCallArgsFromFindItems = () =>
        findItems.mock.calls[findItems.mock.calls.length - 1];

      const getSearchBoxValue = () => find('tableListSearchBox').props().defaultValue;

      let expected = 'tag:(tag-2)';
      let [searchTerm] = getLastCallArgsFromFindItems();
      expect(getSearchBoxValue()).toBe(expected);
      expect(searchTerm).toBe(expected);

      // Change the URL to filter down by tag
      await act(async () => {
        if (router?.history.push) {
          router.history.push({
            search: `?${queryString.stringify({ s: '' }, { encode: false })}`,
          });
        }
      });
      component.update();

      // The search bar shouldn't be updated
      expected = 'tag:(tag-2)';
      [searchTerm] = getLastCallArgsFromFindItems();
      expect(getSearchBoxValue()).toBe(expected);
      expect(searchTerm).toBe(expected);
    });

    test('should update the URL when changing a tag from the filter dropdown', async () => {
      let testBed: TestBed;

      const findItems = jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] });

      await act(async () => {
        testBed = await setupTagFiltering({
          findItems,
        });
      });

      const { component, find } = testBed!;
      component.update();

      expect(router?.history.location?.search).toBe('');

      const openTagFilterDropdown = async () => {
        await act(async () => {
          find('tagFilterPopoverButton').simulate('click');
        });
        component.update();
      };

      // Change tag selection in drop down should update the URL
      await openTagFilterDropdown();

      await act(async () => {
        find('tag-searchbar-option-tag-2').simulate('click');
      });
      component.update();

      expect(router?.history.location?.search).toBe('?s=tag:(tag-2)');
    });

    test('should set initial sort column and direction from URL', async () => {
      let testBed: TestBed;

      const findItems = jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] });

      await act(async () => {
        testBed = await setupInitialUrl(
          `?${queryString.stringify({ sort: 'updatedAt', sortdir: 'asc' })}`
        )({
          findItems,
        });
      });

      const { component, table } = testBed!;
      component.update();

      let { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['Item 2tag-2', twoDaysAgoToString],
        ['Item 1tag-1', yesterdayToString],
      ]);

      // Change the URL
      await act(async () => {
        if (router?.history.push) {
          router.history.push({
            search: `?${queryString.stringify({ sort: 'updatedAt', sortdir: 'desc' })}`,
          });
        }
      });
      component.update();

      ({ tableCellsValues } = table.getMetaData('listingTable-isLoaded'));

      expect(tableCellsValues).toEqual([
        ['Item 2tag-2', twoDaysAgoToString],
        ['Item 1tag-1', yesterdayToString], // Sort stayed the same
      ]);
    });

    test('should update the URL when changing the sort from the dropdown', async () => {
      let testBed: TestBed;

      const findItems = jest.fn().mockResolvedValue({ total: hits.length, hits: [...hits] });

      await act(async () => {
        testBed = await setupTagFiltering({
          findItems,
        });
      });

      const { component, table, find } = testBed!;
      component.update();

      const openSortSelect = () => {
        act(() => {
          testBed.find('tableSortSelectBtn').at(0).simulate('click');
        });
        component.update();
      };

      let { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      // Initial state
      expect(router?.history.location?.search).toBe('');
      expect(tableCellsValues).toEqual([
        ['Item 1tag-1', yesterdayToString],
        ['Item 2tag-2', twoDaysAgoToString],
      ]);

      // Change sort with dropdown
      openSortSelect();
      const filterOptions = find('sortSelect').find('li');

      // Check that the second option is 'Z-A'
      expect(filterOptions.at(1).text()).toBe('Z-A');

      // Click 'Z-A'
      act(() => {
        filterOptions.at(1).simulate('click');
      });
      component.update();

      ({ tableCellsValues } = table.getMetaData('listingTable-isLoaded'));

      // Updated state
      expect(tableCellsValues).toEqual([
        ['Item 2tag-2', twoDaysAgoToString],
        ['Item 1tag-1', yesterdayToString],
      ]);
      expect(router?.history.location?.search).toBe('?sort=title&sortdir=desc');
    });
  });

  describe('row item actions', () => {
    const hits: UserContentCommonSchema[] = [
      {
        id: '123',
        updatedAt: twoDaysAgo.toISOString(),
        type: 'dashboard',
        attributes: {
          title: 'Item 1',
          description: 'Item 1 description',
        },
        references: [],
      },
      {
        id: '456',
        updatedAt: yesterday.toISOString(),
        type: 'dashboard',
        attributes: {
          title: 'Item 2',
          description: 'Item 2 description',
        },
        references: [],
      },
    ];

    const setupTest = async (props?: Partial<TableListViewTableProps>) => {
      let testBed: TestBed | undefined;
      const deleteItems = jest.fn();
      await act(async () => {
        testBed = await setup({
          findItems: jest.fn().mockResolvedValue({ total: hits.length, hits }),
          deleteItems,
          ...props,
        });
      });

      testBed!.component.update();
      return { testBed: testBed!, deleteItems };
    };

    test('should allow select items to be deleted', async () => {
      const { testBed, deleteItems } = await setupTest();

      const { table, exists, component } = testBed;
      const { selectRow, clickDeleteSelectedItemsButton, clickConfirmModalButton } =
        getActions(testBed);

      const { tableCellsValues } = table.getMetaData('listingTable-isLoaded');

      expect(tableCellsValues).toEqual([
        ['', 'Item 2Item 2 description', yesterdayToString], // First empty col is the "checkbox"
        ['', 'Item 1Item 1 description', twoDaysAgoToString],
      ]);

      // Select the second item
      const selectedHit = hits[1];

      expect(exists('deleteSelectedItems')).toBe(false);

      selectRow(selectedHit.id);
      // Delete button is now visible
      expect(exists('deleteSelectedItems')).toBe(true);

      // Click delete and validate that confirm modal opens
      expect(component.exists('.euiModal--confirmation')).toBe(false);
      clickDeleteSelectedItemsButton();
      expect(component.exists('.euiModal--confirmation')).toBe(true);

      await clickConfirmModalButton();
      expect(deleteItems).toHaveBeenCalledWith([selectedHit]);
    });

    test('should allow to disable the "delete" action for a row', async () => {
      const reasonMessage = 'This file cannot be deleted.';

      const {
        testBed: { find },
      } = await setupTest({
        rowItemActions: (obj) => {
          if (obj.id === hits[1].id) {
            return {
              delete: {
                enabled: false,
                reason: reasonMessage,
              },
            };
          }
        },
      });

      const firstCheckBox = find(`checkboxSelectRow-${hits[0].id}`);
      const secondCheckBox = find(`checkboxSelectRow-${hits[1].id}`);

      expect(firstCheckBox.props().disabled).toBe(false);
      expect(secondCheckBox.props().disabled).toBe(true);
      // EUI changes the check "aria-label" from "Select this row" to the reason to disable the checkbox
      expect(secondCheckBox.props()['aria-label']).toBe(reasonMessage);
    });
  });
});

describe('TableList', () => {
  const requiredProps: TableListViewTableProps = {
    entityName: 'test',
    entityNamePlural: 'tests',
    initialPageSize: 20,
    findItems: jest.fn().mockResolvedValue({ total: 0, hits: [] }),
    onFetchSuccess: jest.fn(),
    tableCaption: 'test title',
    getDetailViewLink: () => '',
    setPageDataTestSubject: () => {},
  };

  const setup = registerTestBed<string, TableListViewTableProps>(
    WithServices<TableListViewTableProps>(TableListViewTable),
    {
      defaultProps: { ...requiredProps, refreshListBouncer: false },
      memoryRouter: { wrapComponent: true },
    }
  );

  it('refreshes the list when "refreshListBouncer" changes', async () => {
    let testBed: TestBed;

    const originalHits: UserContentCommonSchema[] = [
      {
        id: `item`,
        type: 'dashboard',
        updatedAt: 'original timestamp',
        attributes: {
          title: `Original title`,
        },
        references: [],
      },
    ];
    const findItems = jest
      .fn()
      .mockResolvedValue({ total: originalHits.length, hits: originalHits });

    await act(async () => {
      testBed = setup({ findItems });
    });

    const { component, table } = testBed!;

    findItems.mockClear();
    expect(findItems).not.toHaveBeenCalled();

    const hits: UserContentCommonSchema[] = [
      {
        id: `item`,
        type: 'dashboard',
        updatedAt: 'updated timestamp',
        attributes: {
          title: `Updated title`,
        },
        references: [],
      },
    ];
    findItems.mockResolvedValue({ total: hits.length, hits });

    await act(async () => {
      component.setProps({
        refreshListBouncer: true,
      });
    });

    component.update();

    expect(findItems).toHaveBeenCalledTimes(1);

    const metadata = table.getMetaData('listingTable-isLoaded');

    expect(metadata.tableCellsValues[0][0]).toBe('Updated title');
  });

  it('reports successful fetches', async () => {
    const onFetchSuccess = jest.fn();

    await act(async () => {
      setup({ onFetchSuccess });
    });

    expect(onFetchSuccess).toHaveBeenCalled();
  });

  it('reports the page data test subject', async () => {
    const setPageDataTestSubject = jest.fn();

    await act(async () => {
      setup({ setPageDataTestSubject });
    });

    expect(setPageDataTestSubject).toHaveBeenCalledWith('testLandingPage');
  });
});
