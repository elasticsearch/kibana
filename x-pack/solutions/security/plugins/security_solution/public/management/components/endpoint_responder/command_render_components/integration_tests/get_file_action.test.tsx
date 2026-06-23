/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EndpointCapabilities } from '../../../../../../common/endpoint/service/response_actions/constants';
import { ENDPOINT_CAPABILITIES } from '../../../../../../common/endpoint/service/response_actions/constants';
import type { AppContextTestRender } from '../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../common/mock/endpoint';
import { responseActionsHttpMocks } from '../../../../mocks/response_actions_http_mocks';
import {
  ConsoleManagerTestComponent,
  getConsoleManagerMockRenderResultQueriesAndActions,
} from '../../../console/components/console_manager/mocks';
import type { GetEndpointConsoleCommandsOptions } from '../../lib/console_commands_definition';
import { getEndpointConsoleCommands } from '../../lib/console_commands_definition';
import React from 'react';
import { enterConsoleCommand } from '../../../console/mocks';
import { waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { GET_FILE_ROUTE } from '../../../../../../common/endpoint/constants';
import { getEndpointAuthzInitialStateMock } from '../../../../../../common/endpoint/service/authz/mocks';
import type {
  ActionDetailsApiResponse,
  EndpointPrivileges,
  ResponseActionGetFileOutputContent,
} from '../../../../../../common/endpoint/types';
import {
  INSUFFICIENT_PRIVILEGES_FOR_COMMAND,
  UPGRADE_AGENT_FOR_RESPONDER,
} from '../../../../../common/translations';
import type { HttpFetchOptionsWithPath } from '@kbn/core-http-browser';
import { endpointActionResponseCodes } from '../../lib/endpoint_action_response_codes';

jest.mock('../../../../../common/components/user_privileges');

describe('When using get-file action from response actions console', () => {
  let user: UserEvent;
  let render: (
    capabilities?: EndpointCapabilities[]
  ) => Promise<ReturnType<AppContextTestRender['render']>>;
  let renderResult: ReturnType<AppContextTestRender['render']>;
  let apiMocks: ReturnType<typeof responseActionsHttpMocks>;
  let consoleManagerMockAccess: ReturnType<
    typeof getConsoleManagerMockRenderResultQueriesAndActions
  >;
  let endpointPrivileges: EndpointPrivileges;
  let getConsoleCommandsOptions: GetEndpointConsoleCommandsOptions;
  let mockedContext: AppContextTestRender;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    // Workaround for timeout via https://github.com/testing-library/user-event/issues/833#issuecomment-1171452841
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockedContext = createAppRootMockRenderer();

    apiMocks = responseActionsHttpMocks(mockedContext.coreStart.http);
    endpointPrivileges = { ...getEndpointAuthzInitialStateMock(), loading: false };

    getConsoleCommandsOptions = {
      agentType: 'endpoint',
      endpointAgentId: 'a.b.c',
      endpointCapabilities: [...ENDPOINT_CAPABILITIES],
      endpointPrivileges,
      platform: 'linux',
    };

    render = async (capabilities: EndpointCapabilities[] = [...ENDPOINT_CAPABILITIES]) => {
      renderResult = mockedContext.render(
        <ConsoleManagerTestComponent
          registerConsoleProps={() => {
            return {
              consoleProps: {
                'data-test-subj': 'test',
                commands: getEndpointConsoleCommands({
                  ...getConsoleCommandsOptions,
                  endpointCapabilities: capabilities,
                }),
              },
            };
          }}
        />
      );

      consoleManagerMockAccess = getConsoleManagerMockRenderResultQueriesAndActions(
        user,
        renderResult
      );

      await consoleManagerMockAccess.clickOnRegisterNewConsole();
      await consoleManagerMockAccess.openRunningConsole();

      return renderResult;
    };
  });

  it('should show an error if the `get_file` capability is not present in the endpoint', async () => {
    await render([]);
    await enterConsoleCommand(renderResult, user, 'get-file --path="one/two"');

    expect(renderResult.getByTestId('test-validationError-message').textContent).toEqual(
      UPGRADE_AGENT_FOR_RESPONDER('endpoint', 'get-file')
    );
  });

  it('should show an error if the `get-file` is not authorized', async () => {
    endpointPrivileges.canWriteFileOperations = false;
    await render();
    await enterConsoleCommand(renderResult, user, 'get-file --path="one/two"');

    expect(renderResult.getByTestId('test-validationError-message').textContent).toEqual(
      INSUFFICIENT_PRIVILEGES_FOR_COMMAND
    );
  });

  it('should show an error if `get-file` is entered without `--path` argument', async () => {
    await render([]);
    await enterConsoleCommand(renderResult, user, 'get-file');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Missing required arguments: --path'
    );
  });

  it('should show error if `--path` is empty string', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'get-file --path=""');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Invalid argument value: --path. Argument cannot be empty'
    );
  });

  it('should call the `get_file` api with the expected payload', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'get-file --path="one/two"');

    await waitFor(() => {
      expect(apiMocks.responseProvider.getFile).toHaveBeenCalledWith({
        body: '{"agent_type":"endpoint","endpoint_ids":["a.b.c"],"parameters":{"path":"one/two"}}',
        path: GET_FILE_ROUTE,
        version: '2023-10-31',
      });
    });
  });

  it('should only accept one `--comment`', async () => {
    await render();
    await enterConsoleCommand(
      renderResult,
      user,
      'get-file --path="one/two" --comment "one" --comment "two"'
    );

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Argument can only be used once: --comment'
    );
  });

  it('should display download link once action completes', async () => {
    const actionDetailsApiResponseMock: ReturnType<typeof apiMocks.responseProvider.actionDetails> =
      {
        data: {
          ...apiMocks.responseProvider.actionDetails({
            path: '/1',
          } as HttpFetchOptionsWithPath).data,

          completedAt: new Date().toISOString(),
          command: 'get-file',
        },
      };
    apiMocks.responseProvider.actionDetails.mockReturnValue(actionDetailsApiResponseMock);

    await render();
    await enterConsoleCommand(renderResult, user, 'get-file --path="one/two"');

    await waitFor(() => {
      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(renderResult.getByTestId('getFileSuccess').textContent).toEqual(
        'File retrieved from the host.Click here to download(ZIP file passcode: elastic).Files are periodically deleted to clear storage space. Download and save file locally if needed.'
      );
    });
  });

  it.each([
    'ra_get-file_error_canceled',
    'ra_get-file_error_not-found',
    'ra_get-file_error_is-directory',
    'ra_get-file_error_invalid-input',
    'ra_get-file_error_not-permitted',
    'ra_get-file_error_too-big',
    'ra_get-file_error_disk-quota',
    'ra_get-file_error_processing',
    'ra_get-file_error_upload-api-unreachable',
    'ra_get-file_error_upload-timeout',
    'ra_get-file_error_queue-timeout',
    'ra_get-file_error_not-enough-free-space',
  ])('should show detailed error if get-file failure returned code: %s', async (outputCode) => {
    const pendingDetailResponse = apiMocks.responseProvider.actionDetails({
      path: '/api/endpoint/action/a.b.c',
    }) as ActionDetailsApiResponse<ResponseActionGetFileOutputContent>;

    pendingDetailResponse.data.command = 'get-file';
    pendingDetailResponse.data.wasSuccessful = false;
    pendingDetailResponse.data.errors = ['not found'];
    pendingDetailResponse.data.agentState = {
      'agent-a': {
        isCompleted: true,
        wasSuccessful: false,
        wasCanceled: false,
        errors: ['not found'],
        completedAt: new Date().toISOString(),
      },
    };
    pendingDetailResponse.data.outputs = {
      'agent-a': {
        type: 'json',
        content: {
          code: outputCode,
        } as unknown as ResponseActionGetFileOutputContent,
      },
    };
    apiMocks.responseProvider.actionDetails.mockReturnValue(pendingDetailResponse);
    await render();
    await enterConsoleCommand(renderResult, user, 'get-file --path one');

    await waitFor(() => {
      expect(renderResult.getByTestId('getFile-actionFailure').textContent).toMatch(
        // RegExp below taken from: https://github.com/sindresorhus/escape-string-regexp/blob/main/index.js
        new RegExp(endpointActionResponseCodes[outputCode].replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'))
      );
    });
  });

  describe('And agent type is SentinelOne', () => {
    beforeEach(() => {
      getConsoleCommandsOptions.agentType = 'sentinel_one';
    });

    it('should call API with `agent_type` set to `sentinel_one`', async () => {
      await render();
      await enterConsoleCommand(renderResult, user, 'get-file --path="one/two"');

      await waitFor(() => {
        expect(apiMocks.responseProvider.getFile).toHaveBeenCalledWith({
          body: '{"agent_type":"sentinel_one","endpoint_ids":["a.b.c"],"parameters":{"path":"one/two"}}',
          path: GET_FILE_ROUTE,
          version: '2023-10-31',
        });
      });
    });

    it('should not look at `capabilities` to determine compatibility', async () => {
      await render([]);
      await enterConsoleCommand(renderResult, user, 'get-file --path="one/two"');

      await waitFor(() => {
        expect(apiMocks.responseProvider.getFile).toHaveBeenCalled();
      });
      expect(renderResult.queryByTestId('test-validationError-message')).toBeNull();
    });

    it('should display pending message', async () => {
      apiMocks.responseProvider.getFile.mockDelay.mockImplementation(
        () => new Promise((r) => setTimeout(r, 100))
      );
      await render();
      await enterConsoleCommand(renderResult, user, 'get-file --path="one/two"');

      await waitFor(() => {
        expect(renderResult.getByTestId('getFile-pending'));
      });
    });
  });
});
