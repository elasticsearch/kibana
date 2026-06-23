/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import * as reactTestingLibrary from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import type { IHttpFetchError } from '@kbn/core-http-browser';
import {
  type AppContextTestRender,
  createAppRootMockRenderer,
} from '../../../../common/mock/endpoint';
import { ResponseActionsLog } from '../response_actions_log';
import type {
  ActionDetails,
  ActionDetailsApiResponse,
  ActionFileInfoApiResponse,
  ResponseActionUploadOutputContent,
  ResponseActionUploadParameters,
} from '../../../../../common/endpoint/types';
import { MANAGEMENT_PATH } from '../../../../../common/constants';
import { getActionListMock } from '../mocks';
import { useGetEndpointsList } from '../../../hooks/endpoint/use_get_endpoints_list';
import { v4 as uuidv4 } from 'uuid';
import {
  RESPONSE_ACTION_AGENT_TYPE,
  RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP,
  RESPONSE_ACTION_API_COMMANDS_NAMES,
  RESPONSE_ACTION_TYPE,
} from '../../../../../common/endpoint/service/response_actions/constants';
import { useUserPrivileges as _useUserPrivileges } from '../../../../common/components/user_privileges';
import { responseActionsHttpMocks } from '../../../mocks/response_actions_http_mocks';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import { useGetEndpointActionList as _useGetEndpointActionList } from '../../../hooks/response_actions/use_get_endpoint_action_list';
import { OUTPUT_MESSAGES } from '../translations';
import { EndpointActionGenerator } from '../../../../../common/endpoint/data_generators/endpoint_action_generator';
import type { ExperimentalFeatures } from '../../../../../common';

const useGetEndpointActionListMock = _useGetEndpointActionList as jest.Mock;

jest.mock('../../../hooks/response_actions/use_get_endpoint_action_list', () => {
  const original = jest.requireActual(
    '../../../hooks/response_actions/use_get_endpoint_action_list'
  );
  return {
    ...original,
    useGetEndpointActionList: jest.fn(original.useGetEndpointActionList),
  };
});

jest.mock('@kbn/kibana-react-plugin/public', () => {
  const original = jest.requireActual('@kbn/kibana-react-plugin/public');
  return {
    ...original,
    useKibana: () => {
      const originalUseKibana = original.useKibana();
      return {
        ...originalUseKibana,
        services: {
          ...originalUseKibana.services,
          uiSettings: {
            get: jest.fn().mockImplementation((key) => {
              const get = (k: 'dateFormat' | 'timepicker:quickRanges') => {
                const x = {
                  dateFormat: 'MMM D, YYYY @ HH:mm:ss.SSS',
                  'timepicker:quickRanges': [
                    {
                      from: 'now/d',
                      to: 'now/d',
                      display: 'Today',
                    },
                    {
                      from: 'now/w',
                      to: 'now/w',
                      display: 'This week',
                    },
                    {
                      from: 'now-15m',
                      to: 'now',
                      display: 'Last 15 minutes',
                    },
                    {
                      from: 'now-30m',
                      to: 'now',
                      display: 'Last 30 minutes',
                    },
                    {
                      from: 'now-1h',
                      to: 'now',
                      display: 'Last 1 hour',
                    },
                    {
                      from: 'now-24h',
                      to: 'now',
                      display: 'Last 24 hours',
                    },
                    {
                      from: 'now-7d',
                      to: 'now',
                      display: 'Last 7 days',
                    },
                    {
                      from: 'now-30d',
                      to: 'now',
                      display: 'Last 30 days',
                    },
                    {
                      from: 'now-90d',
                      to: 'now',
                      display: 'Last 90 days',
                    },
                    {
                      from: 'now-1y',
                      to: 'now',
                      display: 'Last 1 year',
                    },
                  ],
                };
                return x[k];
              };
              return get(key);
            }),
          },
        },
      };
    },
  };
});

jest.mock('../../../hooks/endpoint/use_get_endpoints_list');

jest.mock('../../../../common/components/user_privileges');
const useUserPrivilegesMock = _useUserPrivileges as jest.Mock;

let mockUseGetFileInfo: {
  isFetching?: boolean;
  error?: Partial<IHttpFetchError> | null;
  data?: ActionFileInfoApiResponse;
};
jest.mock('../../../hooks/response_actions/use_get_file_info', () => {
  const original = jest.requireActual('../../../hooks/response_actions/use_get_file_info');
  return {
    ...original,
    useGetFileInfo: () => mockUseGetFileInfo,
  };
});

let mockUseGetActionDetails: {
  isFetching?: boolean;
  isFetched?: boolean;
  error?: Partial<IHttpFetchError> | null;
  data?: ActionDetailsApiResponse;
};
jest.mock('../../../hooks/response_actions/use_get_action_details', () => {
  const original = jest.requireActual('../../../hooks/response_actions/use_get_action_details');
  return {
    ...original,
    useGetActionDetails: () => mockUseGetActionDetails,
  };
});

const mockUseGetEndpointsList = useGetEndpointsList as jest.Mock;

const getBaseMockedActionList = () => ({
  isFetched: true,
  isFetching: false,
  error: null,
  refetch: jest.fn(),
});

describe('Response actions history', () => {
  let user: UserEvent;
  const testPrefix = 'test';
  const hostsFilterPrefix = 'hosts-filter';

  let render: (
    props?: React.ComponentProps<typeof ResponseActionsLog>
  ) => ReturnType<AppContextTestRender['render']>;
  let renderResult: ReturnType<typeof render>;
  let history: AppContextTestRender['history'];
  let mockedContext: AppContextTestRender;
  let apiMocks: ReturnType<typeof responseActionsHttpMocks>;

  const filterByHosts = async (selectedOptionIndexes: number[]) => {
    const { getByTestId, getAllByTestId } = renderResult;
    const popoverButton = getByTestId(`${testPrefix}-${hostsFilterPrefix}-popoverButton`);

    await user.click(popoverButton);

    if (selectedOptionIndexes.length) {
      const allFilterOptions = getAllByTestId(`${hostsFilterPrefix}-option`);

      for (const [i, option] of allFilterOptions.entries()) {
        if (selectedOptionIndexes.includes(i)) {
          await user.click(option);
        }
      }
    }
  };

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    // Workaround for timeout via https://github.com/testing-library/user-event/issues/833#issuecomment-1171452841
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime, pointerEventsCheck: 0 });
    mockedContext = createAppRootMockRenderer();
    ({ history } = mockedContext);
    render = (props?: React.ComponentProps<typeof ResponseActionsLog>) =>
      (renderResult = mockedContext.render(
        <ResponseActionsLog data-test-subj={testPrefix} {...(props ?? {})} />
      ));

    useGetEndpointActionListMock.mockReturnValue({
      ...getBaseMockedActionList(),
      data: await getActionListMock({ actionCount: 13 }),
    });

    mockUseGetEndpointsList.mockReturnValue({
      data: Array.from({ length: 50 }).map(() => {
        const id = uuidv4();
        return {
          id,
          name: `Host-${id.slice(0, 8)}`,
        };
      }),
      page: 0,
      pageSize: 50,
      total: 50,
    });
    useUserPrivilegesMock.mockReturnValue({
      endpointPrivileges: getEndpointAuthzInitialStateMock(),
    });
  });

  afterEach(() => {
    useGetEndpointActionListMock.mockReturnValue(getBaseMockedActionList());
    useUserPrivilegesMock.mockReset();
  });

  it('should call API with default date range', () => {
    reactTestingLibrary.act(() => {
      history.push(`${MANAGEMENT_PATH}/response_actions_history`);
    });

    render();
    expect(useGetEndpointActionListMock).toHaveBeenCalledWith(
      {
        page: 1,
        pageSize: 10,
        agentIds: undefined,
        agentTypes: [],
        commands: [],
        statuses: [],
        types: [],
        userIds: [],
        withOutputs: [],
        startDate: 'now-24h/h',
        endDate: 'now',
      },
      { retry: false }
    );
  });

  describe('When index does not exist yet', () => {
    it('should show global loader when waiting for response', () => {
      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        isFetched: false,
        isFetching: true,
      });
      render();
      expect(renderResult.getByTestId(`${testPrefix}-global-loader`)).toBeTruthy();
    });
    it('should show empty page when there is no index', () => {
      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        error: {
          body: { statusCode: 404, message: 'index_not_found_exception' },
        },
      });
      render();
      expect(renderResult.getByTestId(`${testPrefix}-empty-state`)).toBeTruthy();
    });
  });

  describe('Without data', () => {
    it('should show date filters', () => {
      render();
      expect(renderResult.getByTestId(`${testPrefix}-super-date-picker`)).toBeTruthy();
    });

    it('should show actions filter', () => {
      render();
      expect(renderResult.getByTestId(`${testPrefix}-actions-filter-popoverButton`)).toBeTruthy();
    });

    it('should show empty state when there is no data', async () => {
      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        data: await getActionListMock({ actionCount: 0 }),
      });
      render();
      expect(renderResult.getByTestId(`${testPrefix}-empty-prompt`)).toBeTruthy();
    });
  });

  describe('With Data', () => {
    beforeEach(() => {
      apiMocks = responseActionsHttpMocks(mockedContext.coreStart.http);
    });

    it('should show table when there is data', async () => {
      render();

      const { getByTestId } = renderResult;

      // Ensure API was called with no filters set aside from the date timeframe
      expect(useGetEndpointActionListMock).toHaveBeenLastCalledWith(
        {
          agentIds: undefined,
          agentTypes: [],
          commands: [],
          endDate: 'now',
          page: 1,
          pageSize: 10,
          startDate: 'now-24h/h',
          statuses: [],
          types: [],
          userIds: [],
          withOutputs: [],
        },
        expect.anything()
      );
      expect(getByTestId(`${testPrefix}`)).toBeTruthy();
      expect(getByTestId(`${testPrefix}-endpointListTableTotal`)).toHaveTextContent(
        'Showing 1-10 of 13 response actions'
      );
    });

    it('should show expected column names on the table', async () => {
      render({ agentIds: 'agent-a' });

      expect(
        Array.from(renderResult.getByTestId(`${testPrefix}`).querySelectorAll('thead th'))
          .slice(0, 6)
          .map((col) => col.textContent)
      ).toEqual(['Time', 'Command', 'User', 'Comments', 'Status', 'Expand rows']);
    });

    it('should show `Hosts` column when `showHostNames` is TRUE', async () => {
      render({ showHostNames: true });

      expect(
        Array.from(renderResult.getByTestId(`${testPrefix}`).querySelectorAll('thead th'))
          .slice(0, 7)
          .map((col) => col.textContent)
      ).toEqual(['Time', 'Command', 'User', 'Hosts', 'Comments', 'Status', 'Expand rows']);
    });

    it('should show multiple hostnames correctly', async () => {
      const data = await getActionListMock({
        actionCount: 1,
        hosts: {
          'agent-b': { name: 'Host-agent-b' },
          'agent-c': { name: '' },
          'agent-d': { name: 'Host-agent-d' },
        },
        agentIds: ['agent-a', 'agent-b', 'agent-c', 'agent-d'],
      });

      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        data,
      });
      render({ showHostNames: true });

      expect(renderResult.getByTestId(`${testPrefix}-column-hostname`)).toHaveTextContent(
        'Host-agent-a, Host-agent-b, agent-c (Host name unavailable), Host-agent-d'
      );
    });

    it('should show display host is unenrolled for a single agent action when metadata host name is empty', async () => {
      const data = await getActionListMock({
        actionCount: 1,
        agentIds: ['agent-a'],
        hosts: { 'agent-a': { name: '' } },
      });

      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        data,
      });
      render({ showHostNames: true });

      expect(renderResult.getByTestId(`${testPrefix}-column-hostname`)).toHaveTextContent(
        'agent-a (Host name unavailable)'
      );
    });

    it('should show display host is unenrolled for a single agent action when metadata host names are empty', async () => {
      const data = await getActionListMock({
        actionCount: 1,
        agentIds: ['agent-a', 'agent-b', 'agent-c'],
        hosts: {
          'agent-a': { name: '' },
          'agent-b': { name: '' },
          'agent-c': { name: '' },
        },
      });

      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        data,
      });
      render({ showHostNames: true });

      expect(renderResult.getByTestId(`${testPrefix}-column-hostname`)).toHaveTextContent(
        'agent-a (Host name unavailable), agent-b (Host name unavailable), agent-c (Host name unavailable)'
      );
    });

    it('should paginate table when there is data', async () => {
      render();
      const { getByTestId } = renderResult;

      expect(getByTestId(`${testPrefix}`)).toBeTruthy();
      expect(getByTestId(`${testPrefix}-endpointListTableTotal`)).toHaveTextContent(
        'Showing 1-10 of 13 response actions'
      );

      const page2 = getByTestId('pagination-button-1');
      await user.click(page2);
      expect(getByTestId(`${testPrefix}-endpointListTableTotal`)).toHaveTextContent(
        'Showing 11-13 of 13 response actions'
      );
    });

    it('should update per page rows on the table', async () => {
      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        data: await getActionListMock({ actionCount: 33 }),
      });

      render();
      const { getByTestId } = renderResult;

      expect(getByTestId(`${testPrefix}`)).toBeTruthy();
      expect(getByTestId(`${testPrefix}-endpointListTableTotal`)).toHaveTextContent(
        'Showing 1-10 of 33 response actions'
      );

      // should have 4 pages each of size 10.
      expect(getByTestId('pagination-button-0')).toHaveAttribute('aria-label', 'Page 1 of 4');

      // toggle page size popover
      await user.click(getByTestId('tablePaginationPopoverButton'));
      await waitForEuiPopoverOpen();
      // click size 20
      await user.click(getByTestId('tablePagination-20-rows'));

      expect(getByTestId(`${testPrefix}-endpointListTableTotal`)).toHaveTextContent(
        'Showing 1-20 of 33 response actions'
      );

      // should have only 2 pages each of size 20
      expect(getByTestId('pagination-button-0')).toHaveAttribute('aria-label', 'Page 1 of 2');
    });

    it('should show 1-1 record label when only 1 record', async () => {
      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        data: await getActionListMock({ actionCount: 1 }),
      });
      render();

      expect(renderResult.getByTestId(`${testPrefix}-endpointListTableTotal`)).toHaveTextContent(
        'Showing 1-1 of 1 response action'
      );
    });

    it('should expand/collapse each row to show/hide details', async () => {
      render();
      const { getAllByTestId, queryAllByTestId } = renderResult;

      const expandButtons = getAllByTestId(`${testPrefix}-expand-button`);
      for (const button of expandButtons) {
        await user.click(button);
      }
      const trays = getAllByTestId(`${testPrefix}-details-tray`);
      expect(trays).toBeTruthy();
      expect(trays.length).toEqual(13);

      for (const button of expandButtons) {
        await user.click(button);
      }
      const noTrays = queryAllByTestId(`${testPrefix}-details-tray`);
      expect(noTrays).toEqual([]);
    });

    it('should show already expanded trays on page navigation', async () => {
      // start with two pages worth of response actions
      // 10 on page 1, 3 on page 2
      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        data: await getActionListMock({ actionCount: 13 }),
      });
      render();
      const { getByTestId, getAllByTestId } = renderResult;

      // on page 1
      expect(getByTestId(`${testPrefix}-endpointListTableTotal`)).toHaveTextContent(
        'Showing 1-10 of 13 response actions'
      );
      const expandButtonsOnPage1 = getAllByTestId(`${testPrefix}-expand-button`);
      // expand 2nd, 4th, 6th rows
      for (const [i, button] of expandButtonsOnPage1.entries()) {
        if ([1, 3, 5].includes(i)) {
          await user.click(button);
        }
      }
      // verify 3 rows are expanded
      const traysOnPage1 = getAllByTestId(`${testPrefix}-details-tray`);
      expect(traysOnPage1).toBeTruthy();
      expect(traysOnPage1.length).toEqual(3);

      // go to 2nd page
      const page2 = getByTestId('pagination-button-1');
      await user.click(page2);

      // verify on page 2
      expect(getByTestId(`${testPrefix}-endpointListTableTotal`)).toHaveTextContent(
        'Showing 11-13 of 13 response actions'
      );

      // go back to 1st page
      await user.click(getByTestId('pagination-button-0'));
      // verify on page 1
      expect(getByTestId(`${testPrefix}-endpointListTableTotal`)).toHaveTextContent(
        'Showing 1-10 of 13 response actions'
      );

      const traysOnPage1back = getAllByTestId(`${testPrefix}-details-tray`);
      const expandButtonsOnPage1back = getAllByTestId(`${testPrefix}-expand-button`);
      const expandedButtons = expandButtonsOnPage1back.reduce<number[]>((acc, button, i) => {
        // find expanded rows
        if (button.getAttribute('aria-label') === 'Collapse') {
          acc.push(i);
        }
        return acc;
      }, []);

      // verify 3 rows are expanded
      expect(traysOnPage1back).toBeTruthy();
      expect(traysOnPage1back.length).toEqual(3);
      // verify 3 rows that are expanded are the ones from before
      expect(expandedButtons).toEqual([1, 3, 5]);
    });

    it('should contain relevant details in each expanded row', async () => {
      render();
      const { getAllByTestId } = renderResult;

      const expandButtons = getAllByTestId(`${testPrefix}-expand-button`);
      for (const button of expandButtons) {
        await user.click(button);
      }
      const trays = getAllByTestId(`${testPrefix}-details-tray`);
      expect(trays).toBeTruthy();
      expect(Array.from(trays[0].querySelectorAll('dt')).map((title) => title.textContent)).toEqual(
        [
          'Command placed',
          'Execution started on',
          'Execution completed',
          'Input',
          'Parameters',
          'Comment',
          'Hostname',
          'Agent type',
          'Output:',
        ]
      );
    });

    it('should contain agent type info in each expanded row', async () => {
      render();
      const { getAllByTestId } = renderResult;

      const expandButtons = getAllByTestId(`${testPrefix}-expand-button`);
      for (const button of expandButtons) {
        await user.click(button);
      }
      const trays = getAllByTestId(`${testPrefix}-details-tray`);
      expect(trays).toBeTruthy();
      expect(Array.from(trays[0].querySelectorAll('dt')).map((title) => title.textContent)).toEqual(
        [
          'Command placed',
          'Execution started on',
          'Execution completed',
          'Input',
          'Parameters',
          'Comment',
          'Hostname',
          'Agent type',
          'Output:',
        ]
      );
    });

    it('should refresh data when autoRefresh is toggled on', async () => {
      const listHookResponse = getBaseMockedActionList();
      useGetEndpointActionListMock.mockReturnValue(listHookResponse);
      render();
      const { getByTestId } = renderResult;

      const quickMenuButton = getByTestId('superDatePickerToggleQuickMenuButton');
      await user.click(quickMenuButton);
      await waitForEuiPopoverOpen();

      const toggle = getByTestId('superDatePickerToggleRefreshButton');
      const intervalInput = getByTestId('superDatePickerRefreshIntervalInput');

      await user.click(toggle);
      reactTestingLibrary.fireEvent.change(intervalInput, { target: { value: 1 } });

      await reactTestingLibrary.waitFor(() => {
        expect(listHookResponse.refetch).toHaveBeenCalledTimes(3);
      });
    });

    it('should refresh data when super date picker refresh button is clicked', async () => {
      const listHookResponse = getBaseMockedActionList();
      useGetEndpointActionListMock.mockReturnValue(listHookResponse);
      render();

      const superRefreshButton = renderResult.getByTestId(`${testPrefix}-super-refresh-button`);
      await user.click(superRefreshButton);
      await waitFor(() => {
        expect(listHookResponse.refetch).toHaveBeenCalled();
      });
    });

    it('should set date picker with relative dates', async () => {
      render();
      const { getByTestId } = renderResult;

      const quickMenuButton = getByTestId('superDatePickerToggleQuickMenuButton');
      const startDatePopoverButton = getByTestId(`superDatePickerShowDatesButton`);

      // shows 24 hours at first
      expect(startDatePopoverButton).toHaveTextContent('Last 24 hours');

      // pick another relative date
      await user.click(quickMenuButton);
      await waitForEuiPopoverOpen();
      await user.click(getByTestId('superDatePickerCommonlyUsed_Last_15 minutes'));
      expect(startDatePopoverButton).toHaveTextContent('Last 15 minutes');
    });

    describe('`get-file` action', () => {
      it('should contain download link in expanded row for `get-file` action WITH file operation permission', async () => {
        useUserPrivilegesMock.mockReturnValue({
          endpointPrivileges: getEndpointAuthzInitialStateMock({
            canWriteExecuteOperations: false,
          }),
        });
        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data: await getActionListMock({ actionCount: 1, commands: ['get-file'] }),
        });

        mockUseGetFileInfo = {
          isFetching: false,
          error: null,
          data: apiMocks.responseProvider.fileInfo(),
        };

        render();

        const { getByTestId } = renderResult;
        const expandButton = getByTestId(`${testPrefix}-expand-button`);
        await user.click(expandButton);

        await waitFor(() => {
          expect(apiMocks.responseProvider.fileInfo).toHaveBeenCalled();
        });

        const downloadLink = getByTestId(`${testPrefix}-output-getFileDownloadLink`);
        expect(downloadLink).toBeTruthy();
        expect(downloadLink.textContent).toEqual(
          'Click here to download(ZIP file passcode: elastic).Files are periodically deleted to clear storage space. Download and save file locally if needed.'
        );
      });

      it('should not contain download link in expanded row for `get-file` action when NO file operation permission', async () => {
        useUserPrivilegesMock.mockReturnValue({
          endpointPrivileges: getEndpointAuthzInitialStateMock({
            canWriteFileOperations: false,
          }),
        });

        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data: await getActionListMock({ actionCount: 1, commands: ['get-file'] }),
        });

        render();
        const { getByTestId, queryByTestId } = renderResult;

        const expandButton = getByTestId(`${testPrefix}-expand-button`);
        await user.click(expandButton);
        const output = getByTestId(`${testPrefix}-details-tray-output`);
        expect(output).toBeTruthy();
        expect(output.textContent).toEqual('get-file completed successfully');
        expect(queryByTestId(`${testPrefix}-getFileDownloadLink`)).toBeNull();
      });
    });

    describe('`execute` action', () => {
      it('should contain full output download link in expanded row for `execute` action WITH execute operation privilege', async () => {
        useUserPrivilegesMock.mockReturnValue({
          endpointPrivileges: getEndpointAuthzInitialStateMock({
            canWriteExecuteOperations: true,
            canWriteFileOperations: false,
          }),
        });
        const actionDetails = await getActionListMock({ actionCount: 1, commands: ['execute'] });
        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data: actionDetails,
        });

        mockUseGetFileInfo = {
          isFetching: false,
          error: null,
          data: apiMocks.responseProvider.fileInfo(),
        };

        mockUseGetActionDetails = {
          isFetching: false,
          isFetched: true,
          error: null,
          data: {
            ...apiMocks.responseProvider.actionDetails({
              path: `/api/endpoint/action/${actionDetails.data[0].id}`,
            }),
            data: {
              ...apiMocks.responseProvider.actionDetails({
                path: `/api/endpoint/action/${actionDetails.data[0].id}`,
              }).data,
              outputs: {
                [actionDetails.data[0].agents[0]]: {
                  content: {},
                  type: 'json',
                },
              },
            },
          },
        };

        render();

        const { getByTestId } = renderResult;
        const expandButton = getByTestId(`${testPrefix}-expand-button`);
        await user.click(expandButton);

        await waitFor(() => {
          expect(apiMocks.responseProvider.fileInfo).toHaveBeenCalled();
        });

        const downloadExecuteLink = getByTestId(
          `${testPrefix}-output-actionsLogTray-getExecuteLink`
        );
        expect(downloadExecuteLink).toBeTruthy();
        expect(downloadExecuteLink.textContent).toEqual(
          'Click here to download full output(ZIP file passcode: elastic).Files are periodically deleted to clear storage space. Download and save file locally if needed.'
        );
      });

      it('should contain expected output accordions for `execute` action WITH execute operation privilege', async () => {
        const actionListApiResponse = await getActionListMock({
          actionCount: 1,
          agentIds: ['agent-a'],
          commands: ['execute'],
        });
        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data: actionListApiResponse,
        });

        mockUseGetFileInfo = {
          isFetching: false,
          error: null,
          data: apiMocks.responseProvider.fileInfo(),
        };

        mockUseGetActionDetails = {
          isFetching: false,
          isFetched: true,
          error: null,
          data: {
            data: actionListApiResponse.data[0],
          },
        };

        render();

        const { getByTestId } = renderResult;
        const expandButton = getByTestId(`${testPrefix}-expand-button`);
        await user.click(expandButton);

        await waitFor(() => {
          expect(apiMocks.responseProvider.fileInfo).toHaveBeenCalled();
        });

        const accordionTitles = Array.from(
          getByTestId(`${testPrefix}-output`).querySelectorAll('.euiAccordion__triggerWrapper')
        ).map((el) => el.textContent);

        expect(accordionTitles).toEqual([
          'Execution context',
          'Execution error (truncated)',
          'Execution output (truncated)',
        ]);
      });

      it('should contain execute output for `execute` action WITHOUT execute operation privilege', async () => {
        useUserPrivilegesMock.mockReturnValue({
          endpointPrivileges: getEndpointAuthzInitialStateMock({
            canWriteExecuteOperations: false,
          }),
        });
        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data: await getActionListMock({
            actionCount: 1,
            commands: ['execute'],
            agentIds: ['agent-a'],
          }),
        });

        render();

        const { getByTestId } = renderResult;
        const expandButton = getByTestId(`${testPrefix}-expand-button`);
        await user.click(expandButton);

        expect(getByTestId(`${testPrefix}-output-actionsLogTray-executeResponseOutput-output`));
      });

      it('should not contain full output download link in expanded row for `execute` action WITHOUT Actions Log privileges', async () => {
        useUserPrivilegesMock.mockReturnValue({
          endpointPrivileges: getEndpointAuthzInitialStateMock({
            canAccessEndpointActionsLogManagement: false,
            canReadActionsLogManagement: false,
          }),
        });

        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data: await getActionListMock({ actionCount: 1, commands: ['execute'] }),
        });

        render();
        const { getByTestId, queryByTestId } = renderResult;

        const expandButton = getByTestId(`${testPrefix}-expand-button`);
        await user.click(expandButton);
        expect(queryByTestId(`${testPrefix}-actionsLogTray-getExecuteLink`)).toBeNull();

        const output = getByTestId(`${testPrefix}-details-tray-output`);
        expect(output).toBeTruthy();
        expect(output.textContent).toContain('execute completed successfully');
      });

      it.each(['canAccessEndpointActionsLogManagement', 'canReadActionsLogManagement'])(
        'should contain full output download link in expanded row for `execute` action WITH %s ',
        async (privilege) => {
          const initialActionsLogPrivileges = {
            canAccessEndpointActionsLogManagement: false,
            canReadActionsLogManagement: false,
          };
          useUserPrivilegesMock.mockReturnValue({
            endpointPrivileges: getEndpointAuthzInitialStateMock({
              ...initialActionsLogPrivileges,
              [privilege]: true,
            }),
          });

          useGetEndpointActionListMock.mockReturnValue({
            ...getBaseMockedActionList(),
            data: await getActionListMock({ actionCount: 1, commands: ['execute'] }),
          });

          mockUseGetFileInfo = {
            isFetching: false,
            error: null,
            data: apiMocks.responseProvider.fileInfo(),
          };

          render();
          const { getByTestId } = renderResult;

          const expandButton = getByTestId(`${testPrefix}-expand-button`);
          await user.click(expandButton);

          const output = getByTestId(`${testPrefix}-output-actionsLogTray-getExecuteLink`);
          expect(output).toBeTruthy();
          expect(output.textContent).toEqual(
            'Click here to download full output(ZIP file passcode: elastic).Files are periodically deleted to clear storage space. Download and save file locally if needed.'
          );
        }
      );
    });

    describe('`upload` action', () => {
      let action: ActionDetails<ResponseActionUploadOutputContent, ResponseActionUploadParameters>;

      beforeEach(async () => {
        action = new EndpointActionGenerator().generateActionDetails<
          ResponseActionUploadOutputContent,
          ResponseActionUploadParameters
        >({ command: 'upload' });

        const actionListApiResponse = await getActionListMock({
          actionCount: 1,
          commands: ['upload'],
        });

        actionListApiResponse.data = [action];

        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data: actionListApiResponse,
        });
      });

      it('should display pending output if action is not complete yet', async () => {
        action.isCompleted = false;
        action.agentState[action.agents.at(0)!].isCompleted = false;
        const { getByTestId } = render();
        await user.click(getByTestId(`${testPrefix}-expand-button`));

        expect(getByTestId(`${testPrefix}-details-tray-output`)).toHaveTextContent(
          OUTPUT_MESSAGES.isPending('upload')
        );
      });

      it('should display output for single agent', async () => {
        const { getByTestId } = render();
        await user.click(getByTestId(`${testPrefix}-expand-button`));

        expect(getByTestId(`${testPrefix}-output`)).toHaveTextContent(
          'upload completed successfully' +
            'File saved to: /path/to/uploaded/file' +
            'Free disk space on drive: 1.18MB'
        );
      });

      it('should display output for multiple agents', async () => {
        action.agents.push('agent-b');
        action.hosts['agent-b'] = {
          name: 'host b',
        };
        action.agentState['agent-b'] = {
          errors: undefined,
          wasSuccessful: true,
          wasCanceled: false,
          isCompleted: true,
          completedAt: '2023-05-10T20:09:25.824Z',
        };
        (action.outputs = action.outputs ?? {})['agent-b'] = {
          type: 'json',
          content: {
            code: 'ra_upload_file-success',
            path: 'some/path/to/file',
            disk_free_space: 123445,
          },
        };

        const { getByTestId } = render();

        await user.click(getByTestId(`${testPrefix}-expand-button`));

        expect(getByTestId(`${testPrefix}-output`)).toHaveTextContent(
          'Host-agent-a: upload completed successfully' +
            'Execution completed 2022-04-30T16:08:47.449Z' +
            'File saved to: /path/to/uploaded/file' +
            'Free disk space on drive: 1.18MB' +
            'host b: upload completed successfully' +
            'Execution completed 2023-05-10T20:09:25.824Z' +
            'File saved to: some/path/to/file' +
            'Free disk space on drive: 120.55KB'
        );
      });
    });
  });

  describe('Action status', () => {
    beforeEach(() => {
      apiMocks = responseActionsHttpMocks(mockedContext.coreStart.http);
    });

    const expandRows = async () => {
      const { getAllByTestId } = renderResult;

      const expandButtons = getAllByTestId(`${testPrefix}-expand-button`);
      for (const button of expandButtons) {
        await user.click(button);
      }
      return getAllByTestId(`${testPrefix}-details-tray-output`);
    };

    it.each(RESPONSE_ACTION_API_COMMANDS_NAMES)(
      'shows completed status badge for successfully completed %s actions',
      async (command) => {
        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data: await getActionListMock({
            actionCount: 2,
            agentIds: ['agent-a', 'agent-b'],
            hosts: {
              'agent-a': { name: 'Host-agent-a' },
              'agent-b': { name: 'Host-agent-b' },
            },
            commands: [command],
            agentState: {
              'agent-a': {
                errors: undefined,
                wasSuccessful: true,
                wasCanceled: false,
                isCompleted: true,
                completedAt: '2023-05-10T20:09:25.824Z',
              },
              'agent-b': {
                errors: undefined,
                wasSuccessful: true,
                wasCanceled: false,
                isCompleted: true,
                completedAt: '2023-05-10T20:09:25.824Z',
              },
            },
            outputs: (command === 'upload'
              ? {
                  'agent-a': {
                    type: 'json',
                    content: {
                      code: 'ra_upload_file-success',
                      path: 'some/path/to/file',
                      disk_free_space: 123445,
                    },
                  },
                  'agent-b': {
                    type: 'json',
                    content: {
                      code: 'ra_upload_file-success',
                      path: 'some/path/to/file',
                      disk_free_space: 123445,
                    },
                  },
                }
              : {}) as Pick<ActionDetails, 'outputs'>,
          }),
        });

        if (command === 'get-file' || command === 'execute') {
          mockUseGetFileInfo = {
            isFetching: false,
            error: null,
            data: apiMocks.responseProvider.fileInfo(),
          };
        }

        render();

        const outputCommand = RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[command];

        const outputs = await expandRows();
        expect(outputs.map((n) => n.textContent)).toEqual([
          expect.stringContaining(`${outputCommand} completed successfully`),
          expect.stringContaining(`${outputCommand} completed successfully`),
        ]);
        expect(
          renderResult.getAllByTestId(`${testPrefix}-column-status`).map((n) => n.textContent)
        ).toEqual(['Successful', 'Successful']);
      }
    );

    it.each(RESPONSE_ACTION_API_COMMANDS_NAMES)(
      'shows Failed status badge for failed %s action',
      async (command) => {
        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data: await getActionListMock({
            agentIds: ['agent-a', 'agent-b'],
            actionCount: 2,
            commands: [command],
            wasSuccessful: false,
            status: 'failed',
            errors: [],
            outputs: {
              'agent-a': {
                type: 'json',
                content: {
                  code: 'non_existing_code_for_test',
                },
              },
              'agent-b': {
                type: 'json',
                content: {
                  code: 'non_existing_code_for_test',
                },
              },
            } as ActionDetails['outputs'],
          }),
        });
        render();

        const outputCommand = RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[command];
        const outputs = await expandRows();

        expect(outputs.map((n) => n.textContent)).toEqual([
          expect.stringMatching(
            new RegExp(
              `Host-agent-a: ${outputCommand} failed` +
                'Execution completed .*' +
                'The following errors were encountered:An unknown error occurred' +
                `Host-agent-b: ${outputCommand} failed` +
                'Execution completed .*' +
                'The following errors were encountered:An unknown error occurred'
            )
          ),
          expect.stringMatching(
            new RegExp(
              `Host-agent-a: ${outputCommand} failed` +
                'Execution completed .*' +
                'The following errors were encountered:An unknown error occurred' +
                `Host-agent-b: ${outputCommand} failed` +
                'Execution completed .*' +
                'The following errors were encountered:An unknown error occurred'
            )
          ),
        ]);
        expect(
          renderResult.getAllByTestId(`${testPrefix}-column-status`).map((n) => n.textContent)
        ).toEqual(['Failed', 'Failed']);
      }
    );

    it.each(RESPONSE_ACTION_API_COMMANDS_NAMES)(
      'shows Failed status badge for expired %s action',
      async (command) => {
        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data: await getActionListMock({
            actionCount: 2,
            commands: [command],
            isCompleted: true,
            wasSuccessful: false,
            isExpired: true,
            status: 'failed',
          }),
        });
        render();

        const outputCommand = RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[command];
        const outputs = await expandRows();
        expect(outputs.map((n) => n.textContent)).toEqual([
          `${outputCommand} failed: action expiredThe following errors were encountered:An unknown error occurred`,
          `${outputCommand} failed: action expiredThe following errors were encountered:An unknown error occurred`,
        ]);
        expect(
          renderResult.getAllByTestId(`${testPrefix}-column-status`).map((n) => n.textContent)
        ).toEqual(['Failed', 'Failed']);
      }
    );

    it('shows Pending status badge for pending actions', async () => {
      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        data: await getActionListMock({ actionCount: 2, isCompleted: false, status: 'pending' }),
      });
      render();

      const outputs = await expandRows();
      expect(outputs.map((n) => n.textContent)).toEqual([
        'isolate is pending',
        'isolate is pending',
      ]);
      expect(
        renderResult.getAllByTestId(`${testPrefix}-column-status`).map((n) => n.textContent)
      ).toEqual(['Pending', 'Pending']);
    });
  });

  describe('Action Outputs', () => {
    beforeEach(() => {
      apiMocks = responseActionsHttpMocks(mockedContext.coreStart.http);
    });

    const expandRows = async () => {
      const { getAllByTestId } = renderResult;

      const expandButtons = getAllByTestId(`${testPrefix}-expand-button`);
      for (const button of expandButtons) {
        await user.click(button);
      }
      return getAllByTestId(`${testPrefix}-details-tray-output`);
    };

    describe('Single agents', () => {
      it('should show hostname as - when no hostname is available', async () => {
        const data = await getActionListMock({
          agentIds: ['agent-a'],
          hosts: { 'agent-a': { name: '' } },
          actionCount: 1,
          commands: ['isolate'],
          wasSuccessful: true,
          status: 'failed',
          errors: [],
          agentState: {
            'agent-a': {
              errors: [],
              wasSuccessful: true,
              wasCanceled: false,
              isCompleted: true,
              completedAt: '2023-05-10T20:09:25.824Z',
            },
          },
          outputs: {},
        });

        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data,
        });
        render();

        const { getAllByTestId, getByTestId } = renderResult;
        const expandButtons = getAllByTestId(`${testPrefix}-expand-button`);
        for (const button of expandButtons) {
          await user.click(button);
        }

        const hostnameInfo = getByTestId(`${testPrefix}-action-details-info-Hostname`);
        expect(hostnameInfo.textContent).toEqual('agent-a');
      });

      describe('with `outputs` and `errors`', () => {
        it.each(RESPONSE_ACTION_API_COMMANDS_NAMES)(
          'shows failed outputs and errors for %s action',
          async (command) => {
            const data = await getActionListMock({
              agentIds: ['agent-a'],
              actionCount: 1,
              commands: [command],
              wasSuccessful: false,
              status: 'failed',
              errors: ['Error here!'],
              agentState: {
                'agent-a': {
                  errors: ['Error here!'],
                  wasSuccessful: false,
                  wasCanceled: false,
                  isCompleted: true,
                  completedAt: '2023-05-10T20:09:25.824Z',
                },
              },
              // just adding three commands for tests with respective error response codes
              outputs: ['get-file', 'scan'].includes(command)
                ? ({
                    'agent-a': {
                      type: 'json',
                      content: {
                        code:
                          command === 'get-file'
                            ? 'ra_get-file_error_not-found'
                            : command === 'scan'
                            ? 'ra_scan_error_invalid-input'
                            : 'non_existing_code_for_test',
                      },
                    },
                  } as Pick<ActionDetails, 'outputs'>)
                : undefined,
            });

            useGetEndpointActionListMock.mockReturnValue({
              ...getBaseMockedActionList(),
              data,
            });
            render();

            const outputCommand = RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[command];
            const outputs = await expandRows();
            if (command === 'get-file') {
              expect(outputs.map((n) => n.textContent)).toEqual([
                `${outputCommand} failedThe following errors were encountered:The file specified was not found | Error here!`,
              ]);
            } else if (command === 'scan') {
              expect(outputs.map((n) => n.textContent)).toEqual([
                `${outputCommand} failedThe following errors were encountered:Invalid absolute file path provided | Error here!`,
              ]);
            } else {
              expect(outputs.map((n) => n.textContent)).toEqual([
                `${outputCommand} failedThe following error was encountered:Error here!`,
              ]);
            }
          }
        );
      });

      describe('with `errors`', () => {
        it.each(RESPONSE_ACTION_API_COMMANDS_NAMES)(
          'shows failed errors for %s action when no outputs',
          async (command) => {
            useGetEndpointActionListMock.mockReturnValue({
              ...getBaseMockedActionList(),
              data: await getActionListMock({
                agentIds: ['agent-a'],
                actionCount: 1,
                commands: [command],
                wasSuccessful: false,
                status: 'failed',
                errors: ['Error message w/o output'],
                outputs: undefined,
                agentState: {
                  'agent-a': {
                    errors: ['Error message w/o output'],
                    wasSuccessful: false,
                    wasCanceled: false,
                    isCompleted: true,
                    completedAt: '2023-05-10T20:09:25.824Z',
                  },
                },
              }),
            });
            render();

            const outputCommand = RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[command];
            const outputs = await expandRows();
            expect(outputs.map((n) => n.textContent)).toEqual([
              `${outputCommand} failedThe following error was encountered:Error message w/o output`,
            ]);
          }
        );
      });
    });

    describe('Multiple agents', () => {
      it('should show `—` concatenated hostnames when no hostname is available for an agent', async () => {
        const data = await getActionListMock({
          agentIds: ['agent-a', 'agent-b'],
          hosts: {
            'agent-a': { name: '' },
            'agent-b': { name: 'Agent-B' },
            'agent-c': { name: '' },
          },
          actionCount: 1,
          commands: ['isolate'],
          wasSuccessful: true,
          status: 'failed',
          errors: [''],
          agentState: {
            'agent-a': {
              errors: [''],
              wasSuccessful: true,
              wasCanceled: false,
              isCompleted: true,
              completedAt: '2023-05-10T20:09:25.824Z',
            },
            'agent-b': {
              errors: [''],
              wasSuccessful: false,
              wasCanceled: false,
              isCompleted: true,
              completedAt: '2023-05-10T20:09:25.824Z',
            },
            'agent-c': {
              errors: [''],
              wasSuccessful: false,
              wasCanceled: false,
              isCompleted: true,
              completedAt: '2023-05-10T20:09:25.824Z',
            },
          },
          outputs: {},
        });

        useGetEndpointActionListMock.mockReturnValue({
          ...getBaseMockedActionList(),
          data,
        });
        render();

        const { getAllByTestId } = renderResult;
        const expandButtons = getAllByTestId(`${testPrefix}-expand-button`);
        for (const button of expandButtons) {
          await user.click(button);
        }

        const hostnameInfo = getAllByTestId(`${testPrefix}-action-details-info-Hostname`);
        expect(hostnameInfo.map((element) => element.textContent)).toEqual([
          'agent-a, Agent-B, agent-c',
        ]);
      });

      describe('with `outputs` and `errors`', () => {
        it.each(RESPONSE_ACTION_API_COMMANDS_NAMES)(
          'shows failed outputs and errors for %s action on multiple agents',
          async (command) => {
            const data = await getActionListMock({
              agentIds: ['agent-a', 'agent-b'],
              hosts: { 'agent-a': { name: 'Host-agent-a' }, 'agent-b': { name: 'Host-agent-b' } },
              actionCount: 1,
              commands: [command],
              wasSuccessful: false,
              status: 'failed',
              errors: ['Error with agent-a!', 'Error with agent-b!'],
              agentState: {
                'agent-a': {
                  errors: ['Error with agent-a!'],
                  wasSuccessful: false,
                  wasCanceled: false,
                  isCompleted: true,
                  completedAt: '2023-05-10T20:09:25.824Z',
                },
                'agent-b': {
                  errors: ['Error with agent-b!'],
                  wasSuccessful: false,
                  wasCanceled: false,
                  isCompleted: true,
                  completedAt: '2023-05-10T20:09:25.824Z',
                },
              },
              outputs: {
                'agent-a': {
                  type: 'json',
                  content: {
                    code:
                      command === 'get-file'
                        ? 'ra_get-file_error_not-found'
                        : command === 'scan'
                        ? 'ra_scan_error_invalid-input'
                        : 'non_existing_code_for_test',
                    content: undefined,
                  },
                },
                'agent-b': {
                  type: 'json',
                  content: {
                    code:
                      command === 'get-file'
                        ? 'ra_get-file_error_invalid-input'
                        : command === 'scan'
                        ? 'ra_scan_error_invalid-input'
                        : 'non_existing_code_for_test',
                    content: undefined,
                  },
                },
              } as Pick<ActionDetails, 'outputs'>,
            });

            useGetEndpointActionListMock.mockReturnValue({
              ...getBaseMockedActionList(),
              data,
            });
            render();

            const outputCommand = RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[command];
            const outputs = await expandRows();
            if (command === 'get-file') {
              expect(outputs.map((n) => n.textContent)).toEqual([
                'Host-agent-a: get-file failed' +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following errors were encountered:The file specified was not found | Error with agent-a!' +
                  'Host-agent-b: get-file failed' +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following errors were encountered:The path defined is not valid | Error with agent-b!',
              ]);
            } else if (command === 'scan') {
              expect(outputs.map((n) => n.textContent)).toEqual([
                'Host-agent-a: scan failed' +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following errors were encountered:Invalid absolute file path provided | Error with agent-a!' +
                  'Host-agent-b: scan failed' +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following errors were encountered:Invalid absolute file path provided | Error with agent-b!',
              ]);
            } else {
              expect(outputs.map((n) => n.textContent)).toEqual([
                `Host-agent-a: ${outputCommand} failed` +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following error was encountered:Error with agent-a!' +
                  `Host-agent-b: ${outputCommand} failed` +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following error was encountered:Error with agent-b!',
              ]);
            }
          }
        );
      });

      describe('with `errors`', () => {
        it.each(RESPONSE_ACTION_API_COMMANDS_NAMES)(
          'shows failed errors for %s action on multiple agents',
          async (command) => {
            const data = await getActionListMock({
              agentIds: ['agent-a', 'agent-b'],
              hosts: { 'agent-a': { name: 'Host-agent-a' }, 'agent-b': { name: 'Host-agent-b' } },
              actionCount: 1,
              commands: [command],
              wasSuccessful: false,
              status: 'failed',
              errors: ['Error with agent-a!', 'Error with agent-b!'],
              agentState: {
                'agent-a': {
                  errors: ['Error with agent-a!'],
                  wasSuccessful: false,
                  wasCanceled: false,
                  isCompleted: true,
                  completedAt: '2023-05-10T20:09:25.824Z',
                },
                'agent-b': {
                  errors: ['Error with agent-b!'],
                  wasSuccessful: false,
                  wasCanceled: false,
                  isCompleted: true,
                  completedAt: '2023-05-10T20:09:25.824Z',
                },
              },
              outputs: {},
            });

            useGetEndpointActionListMock.mockReturnValue({
              ...getBaseMockedActionList(),
              data,
            });
            render();

            const outputCommand = RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[command];
            const outputs = await expandRows();
            if (command === 'get-file') {
              expect(outputs.map((n) => n.textContent)).toEqual([
                'Host-agent-a: get-file failed' +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following error was encountered:Error with agent-a!' +
                  'Host-agent-b: get-file failed' +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following error was encountered:Error with agent-b!',
              ]);
            } else if (command === 'scan') {
              expect(outputs.map((n) => n.textContent)).toEqual([
                'Host-agent-a: scan failed' +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following error was encountered:Error with agent-a!' +
                  'Host-agent-b: scan failed' +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following error was encountered:Error with agent-b!',
              ]);
            } else {
              expect(outputs.map((n) => n.textContent)).toEqual([
                `Host-agent-a: ${outputCommand} failed` +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following error was encountered:Error with agent-a!' +
                  `Host-agent-b: ${outputCommand} failed` +
                  'Execution completed 2023-05-10T20:09:25.824Z' +
                  'The following error was encountered:Error with agent-b!',
              ]);
            }
          }
        );
      });
    });
  });

  describe('Actions filter', () => {
    let featureFlags: Partial<ExperimentalFeatures>;

    beforeEach(() => {
      featureFlags = {
        crowdstrikeRunScriptEnabled: true,
        microsoftDefenderEndpointCancelEnabled: true,
        responseActionsEndpointMemoryDump: true,
      };

      mockedContext.setExperimentalFlag(featureFlags);
    });

    const filterPrefix = 'actions-filter';

    it('should have a search bar', async () => {
      render();

      const { getByTestId } = renderResult;
      await user.click(getByTestId(`${testPrefix}-${filterPrefix}-popoverButton`));
      const searchBar = getByTestId(`${testPrefix}-${filterPrefix}-search`);
      expect(searchBar).toBeTruthy();
      expect(searchBar.querySelector('input')?.getAttribute('placeholder')).toEqual(
        'Search actions'
      );
    });

    it('should show a list of actions (with `runscript` and `cancel`) when opened', async () => {
      // Note: when we enable new commands, it might be needed to increase the height
      render({ 'data-test-height': 350 });
      const { getByTestId, getAllByTestId } = renderResult;

      await user.click(getByTestId(`${testPrefix}-${filterPrefix}-popoverButton`));
      const filterList = getByTestId(`${testPrefix}-${filterPrefix}-popoverList`);
      expect(filterList).toBeTruthy();
      expect(getAllByTestId(`${filterPrefix}-option`).length).toEqual(
        RESPONSE_ACTION_API_COMMANDS_NAMES.length
      );
      expect(getAllByTestId(`${filterPrefix}-option`).map((option) => option.textContent)).toEqual([
        'isolate. To check this option, press Enter.',
        'release. To check this option, press Enter.',
        'kill-process. To check this option, press Enter.',
        'suspend-process. To check this option, press Enter.',
        'processes. To check this option, press Enter.',
        'get-file. To check this option, press Enter.',
        'execute. To check this option, press Enter.',
        'upload. To check this option, press Enter.',
        'scan. To check this option, press Enter.',
        'runscript. To check this option, press Enter.',
        'cancel. To check this option, press Enter.',
        'memory-dump. To check this option, press Enter.',
      ]);
    });

    it('should show a list of actions (without `cancel`) when cancel feature flag is disabled', async () => {
      // Set the cancel feature flag to false
      const featureFlagsWithoutCancel = {
        ...featureFlags,
        microsoftDefenderEndpointCancelEnabled: false,
      };
      mockedContext.setExperimentalFlag(featureFlagsWithoutCancel);

      render({ 'data-test-height': 350 });
      const { getByTestId, getAllByTestId } = renderResult;

      await user.click(getByTestId(`${testPrefix}-${filterPrefix}-popoverButton`));
      const filterList = getByTestId(`${testPrefix}-${filterPrefix}-popoverList`);
      expect(filterList).toBeTruthy();
      expect(getAllByTestId(`${filterPrefix}-option`).length).toEqual(
        RESPONSE_ACTION_API_COMMANDS_NAMES.length - 1
      );
      expect(getAllByTestId(`${filterPrefix}-option`).map((option) => option.textContent)).toEqual([
        'isolate. To check this option, press Enter.',
        'release. To check this option, press Enter.',
        'kill-process. To check this option, press Enter.',
        'suspend-process. To check this option, press Enter.',
        'processes. To check this option, press Enter.',
        'get-file. To check this option, press Enter.',
        'execute. To check this option, press Enter.',
        'upload. To check this option, press Enter.',
        'scan. To check this option, press Enter.',
        'runscript. To check this option, press Enter.',
        'memory-dump. To check this option, press Enter.',
      ]);
    });

    it('should have `clear all` button `disabled` when no selected values', async () => {
      render();
      const { getByTestId } = renderResult;

      await user.click(getByTestId(`${testPrefix}-${filterPrefix}-popoverButton`));
      const clearAllButton = getByTestId(`${testPrefix}-${filterPrefix}-clearAllButton`);
      expect(clearAllButton.hasAttribute('disabled')).toBeTruthy();
    });
  });

  describe('Statuses filter', () => {
    const filterPrefix = 'statuses-filter';

    it('should show a list of statuses when opened', async () => {
      render();
      const { getByTestId, getAllByTestId } = renderResult;

      await user.click(getByTestId(`${testPrefix}-${filterPrefix}-popoverButton`));
      const filterList = getByTestId(`${testPrefix}-${filterPrefix}-popoverList`);
      expect(filterList).toBeTruthy();
      expect(getAllByTestId(`${filterPrefix}-option`).length).toEqual(4);
      expect(getAllByTestId(`${filterPrefix}-option`).map((option) => option.textContent)).toEqual([
        'Failed',
        'Pending',
        'Successful',
        'Canceled',
      ]);
    });

    it('should have `clear all` button `disabled` when no selected values', async () => {
      render();

      const { getByTestId } = renderResult;

      await user.click(getByTestId(`${testPrefix}-${filterPrefix}-popoverButton`));
      const clearAllButton = getByTestId(`${testPrefix}-${filterPrefix}-clearAllButton`);
      expect(clearAllButton.hasAttribute('disabled')).toBeTruthy();
    });

    it('should use selected statuses on api call', async () => {
      render();
      const { getByTestId, getAllByTestId } = renderResult;

      await user.click(getByTestId(`${testPrefix}-${filterPrefix}-popoverButton`));
      const statusOptions = getAllByTestId(`${filterPrefix}-option`);

      statusOptions[0].style.pointerEvents = 'all';
      await user.click(statusOptions[0]);

      statusOptions[1].style.pointerEvents = 'all';
      await user.click(statusOptions[1]);

      expect(useGetEndpointActionListMock).toHaveBeenLastCalledWith(
        {
          agentIds: undefined,
          agentTypes: [],
          commands: [],
          endDate: 'now',
          page: 1,
          pageSize: 10,
          startDate: 'now-24h/h',
          statuses: ['failed', 'pending'],
          types: [],
          userIds: [],
          withOutputs: [],
        },
        expect.anything()
      );
    });
  });

  describe('Hosts Filter', () => {
    beforeEach(() => {
      const getEndpointListHookResponse = {
        data: Array.from({ length: 50 }).map((_, index) => {
          return {
            id: `id-${index}`,
            name: `Host-${index}`,
          };
        }),
        page: 0,
        pageSize: 50,
        total: 50,
      };
      mockUseGetEndpointsList.mockReturnValue(getEndpointListHookResponse);
    });

    it('should show hosts filter for non-flyout or page', () => {
      render({ showHostNames: true });

      expect(
        renderResult.getByTestId(`${testPrefix}-${hostsFilterPrefix}-popoverButton`)
      ).toBeTruthy();
    });

    it('should have a search bar ', async () => {
      render({ showHostNames: true });
      const { getByTestId } = renderResult;

      await user.click(getByTestId(`${testPrefix}-${hostsFilterPrefix}-popoverButton`));
      const searchBar = getByTestId(`${testPrefix}-${hostsFilterPrefix}-search`);
      expect(searchBar).toBeTruthy();
      expect(searchBar.querySelector('input')?.getAttribute('placeholder')).toEqual('Search hosts');
    });

    it('should show a list of host names when opened', async () => {
      render({ showHostNames: true });
      const { getByTestId, getAllByTestId } = renderResult;

      const popoverButton = getByTestId(`${testPrefix}-${hostsFilterPrefix}-popoverButton`);
      await user.click(popoverButton);
      const filterList = getByTestId(`${testPrefix}-${hostsFilterPrefix}-popoverList`);
      expect(filterList).toBeTruthy();
      expect(getAllByTestId(`${hostsFilterPrefix}-option`).length).toEqual(9);
      expect(
        getByTestId(`${testPrefix}-${hostsFilterPrefix}-popoverButton`).querySelector(
          '.euiNotificationBadge'
        )?.textContent
      ).toEqual('50');
    });

    it('should not pin selected host names to the top when opened and selections are being made', async () => {
      render({ showHostNames: true });
      const { getByTestId, getAllByTestId } = renderResult;

      const popoverButton = getByTestId(`${testPrefix}-${hostsFilterPrefix}-popoverButton`);
      await user.click(popoverButton);
      const allFilterOptions = getAllByTestId(`${hostsFilterPrefix}-option`);
      // click 3 options skip alternates
      for (const [i, option] of allFilterOptions.entries()) {
        if ([1, 3, 5].includes(i)) {
          option.style.pointerEvents = 'all';
          await user.click(option);
        }
      }

      const selectedFilterOptions = getAllByTestId(`${hostsFilterPrefix}-option`).reduce<number[]>(
        (acc, curr, i) => {
          if (curr.getAttribute('aria-checked') === 'true') {
            acc.push(i);
          }
          return acc;
        },
        []
      );

      expect(selectedFilterOptions).toEqual([1, 3, 5]);
    });

    it('should pin selected host names to the top when opened after selections were made', async () => {
      render({ showHostNames: true });
      const { getByTestId, getAllByTestId } = renderResult;

      const popoverButton = getByTestId(`${testPrefix}-${hostsFilterPrefix}-popoverButton`);
      await user.click(popoverButton);
      const allFilterOptions = getAllByTestId(`${hostsFilterPrefix}-option`);
      // click 3 options skip alternates
      for (const [i, option] of allFilterOptions.entries()) {
        if ([1, 3, 5].includes(i)) {
          option.style.pointerEvents = 'all';
          await user.click(option);
        }
      }

      // close
      await user.click(popoverButton);

      // re-open
      await user.click(popoverButton);

      const selectedFilterOptions = getAllByTestId(`${hostsFilterPrefix}-option`).reduce<number[]>(
        (acc, curr, i) => {
          if (curr.getAttribute('aria-checked') === 'true') {
            acc.push(i);
          }
          return acc;
        },
        []
      );

      expect(selectedFilterOptions).toEqual([0, 1, 2]);
    });

    it('should not pin newly selected items with already pinned items', async () => {
      render({ showHostNames: true });
      const { getByTestId, getAllByTestId } = renderResult;

      const popoverButton = getByTestId(`${testPrefix}-${hostsFilterPrefix}-popoverButton`);
      await user.click(popoverButton);
      const allFilterOptions = getAllByTestId(`${hostsFilterPrefix}-option`);
      // click 3 options skip alternates
      for (const [i, option] of allFilterOptions.entries()) {
        if ([1, 3, 5].includes(i)) {
          option.style.pointerEvents = 'all';
          await user.click(option);
        }
      }

      // close
      await user.click(popoverButton);

      // re-open
      await user.click(popoverButton);

      const newSetAllFilterOptions = getAllByTestId(`${hostsFilterPrefix}-option`);
      // click new options
      for (const [i, option] of newSetAllFilterOptions.entries()) {
        if ([4, 6, 8].includes(i)) {
          option.style.pointerEvents = 'all';
          await user.click(option);
        }
      }

      const selectedFilterOptions = getAllByTestId(`${hostsFilterPrefix}-option`).reduce<number[]>(
        (acc, curr, i) => {
          if (curr.getAttribute('aria-checked') === 'true') {
            acc.push(i);
          }
          return acc;
        },
        []
      );

      expect(selectedFilterOptions).toEqual([0, 1, 2, 4, 6, 8]);
    });

    // TODO Revisit, the assertion no longer passes after the update to user-event v14 https://github.com/elastic/kibana/pull/189949
    it.skip('should update the selected options count correctly', async () => {
      const data = await getActionListMock({ actionCount: 1 });

      useGetEndpointActionListMock.mockReturnValue({
        ...getBaseMockedActionList(),
        data,
      });

      render({ showHostNames: true });
      const { getByTestId, getAllByTestId } = renderResult;

      const popoverButton = getByTestId(`${testPrefix}-${hostsFilterPrefix}-popoverButton`);
      await user.click(popoverButton);
      const allFilterOptions = getAllByTestId(`${hostsFilterPrefix}-option`);
      // click 3 options skip alternates
      for (const [i, option] of allFilterOptions.entries()) {
        if ([1, 3, 5].includes(i)) {
          option.style.pointerEvents = 'all';
          await user.click(option);
        }
      }

      expect(popoverButton.textContent).toEqual('Hosts4');
    });

    // TODO Revisit, the assertion no longer passes after the update to user-event v14 https://github.com/elastic/kibana/pull/189949
    it.skip('should call the API with the selected host ids', () => {
      render({ showHostNames: true });
      filterByHosts([0, 2, 4, 6]);

      expect(useGetEndpointActionListMock).toHaveBeenLastCalledWith(
        {
          agentIds: ['id-0', 'id-2', 'id-4', 'id-6'],
          agentTypes: [],
          commands: [],
          endDate: 'now',
          page: 1,
          pageSize: 10,
          startDate: 'now-24h/h',
          statuses: [],
          types: [],
          userIds: [],
          withOutputs: [],
        },
        expect.anything()
      );
    });
  });

  describe('Types filter', () => {
    const filterPrefix = 'types-filter';
    it('should show a list of action types when opened', async () => {
      render();
      const { getByTestId, getAllByTestId } = renderResult;

      await user.click(getByTestId(`${testPrefix}-${filterPrefix}-popoverButton`));
      const filterList = getByTestId(`${testPrefix}-${filterPrefix}-popoverList`);
      expect(filterList).toBeTruthy();
      expect(getAllByTestId(`${filterPrefix}-option`).length).toEqual(RESPONSE_ACTION_TYPE.length);
      expect(getAllByTestId(`${filterPrefix}-option`).map((option) => option.textContent)).toEqual([
        'Triggered by rule',
        'Triggered manually',
      ]);
    });

    it('should show a list of agents and action types when opened in page view', async () => {
      render({ isFlyout: false });
      const { getByTestId, getAllByTestId } = renderResult;

      await user.click(getByTestId(`${testPrefix}-${filterPrefix}-popoverButton`));
      const filterList = getByTestId(`${testPrefix}-${filterPrefix}-popoverList`);
      expect(filterList).toBeTruthy();
      expect(getAllByTestId(`${filterPrefix}-option`).length).toEqual(
        [...RESPONSE_ACTION_AGENT_TYPE, ...RESPONSE_ACTION_TYPE].length
      );
      expect(getAllByTestId(`${filterPrefix}-option`).map((option) => option.textContent)).toEqual([
        'Elastic Defend',
        'SentinelOne',
        'Crowdstrike',
        'Microsoft Defender for Endpoint',
        'Triggered by rule',
        'Triggered manually',
      ]);
    });

    it('should have `clear all` button `disabled` when no selected values', async () => {
      render();
      const { getByTestId } = renderResult;

      await user.click(getByTestId(`${testPrefix}-${filterPrefix}-popoverButton`));
      const clearAllButton = getByTestId(`${testPrefix}-${filterPrefix}-clearAllButton`);
      expect(clearAllButton.hasAttribute('disabled')).toBeTruthy();
    });
  });
});
