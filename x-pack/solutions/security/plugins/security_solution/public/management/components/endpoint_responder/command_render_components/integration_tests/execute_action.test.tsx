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
import { getEndpointConsoleCommands } from '../../lib/console_commands_definition';
import React from 'react';
import { enterConsoleCommand } from '../../../console/mocks';
import { waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { EXECUTE_ROUTE } from '../../../../../../common/endpoint/constants';
import { getEndpointAuthzInitialStateMock } from '../../../../../../common/endpoint/service/authz/mocks';
import type { EndpointPrivileges } from '../../../../../../common/endpoint/types';
import {
  INSUFFICIENT_PRIVILEGES_FOR_COMMAND,
  UPGRADE_AGENT_FOR_RESPONDER,
} from '../../../../../common/translations';
import type { HttpFetchOptionsWithPath } from '@kbn/core-http-browser';
import { endpointActionResponseCodes } from '../../lib/endpoint_action_response_codes';
import { EndpointActionGenerator } from '../../../../../../common/endpoint/data_generators/endpoint_action_generator';

jest.mock('../../../../../common/components/user_privileges');
jest.mock('../../../../../common/experimental_features_service');

describe('When using execute action from response actions console', () => {
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

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    // Workaround for timeout via https://github.com/testing-library/user-event/issues/833#issuecomment-1171452841
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const mockedContext = createAppRootMockRenderer();

    apiMocks = responseActionsHttpMocks(mockedContext.coreStart.http);
    endpointPrivileges = { ...getEndpointAuthzInitialStateMock(), loading: false };

    render = async (capabilities: EndpointCapabilities[] = [...ENDPOINT_CAPABILITIES]) => {
      renderResult = mockedContext.render(
        <ConsoleManagerTestComponent
          registerConsoleProps={() => {
            return {
              consoleProps: {
                'data-test-subj': 'test',
                commands: getEndpointConsoleCommands({
                  agentType: 'endpoint',
                  endpointAgentId: 'a.b.c',
                  endpointCapabilities: [...capabilities],
                  endpointPrivileges,
                  platform: 'linux',
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

  it('should show an error if the `execute` capability is not present in the endpoint', async () => {
    await render([]);
    await enterConsoleCommand(renderResult, user, 'execute --command="ls -al"');

    expect(renderResult.getByTestId('test-validationError-message').textContent).toEqual(
      UPGRADE_AGENT_FOR_RESPONDER('endpoint', 'execute')
    );
  });

  it('should show an error if `execute` is not authorized', async () => {
    endpointPrivileges.canWriteExecuteOperations = false;
    await render();
    await enterConsoleCommand(renderResult, user, 'execute --command="ls -al"');

    expect(renderResult.getByTestId('test-validationError-message').textContent).toEqual(
      INSUFFICIENT_PRIVILEGES_FOR_COMMAND
    );
  });

  it('should show an error if `execute` is entered without `--command` argument', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'execute');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Missing required arguments: --command'
    );
  });

  it('should show error if `--command` is empty string', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'execute --command=""');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Argument --command must have a value'
    );
  });

  it('should show error if `--timeout` is empty string', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'execute --command="ls -al" --timeout=""');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Argument --timeout must have a value'
    );
  });

  it('should show error if `--timeout` does not match required format', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'execute --command="ls -al" --timeout="23d"');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Invalid argument value: --timeout. Argument must be a string with a positive integer value followed by a unit of time (h for hours, m for minutes, s for seconds). Example: 37m.'
    );
  });

  it('should call the `execute` API with the expected payload', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'execute --command="ls -al"');

    await waitFor(() => {
      expect(apiMocks.responseProvider.execute).toHaveBeenCalledWith({
        body: '{"agent_type":"endpoint","endpoint_ids":["a.b.c"],"parameters":{"command":"ls -al"}}',
        path: EXECUTE_ROUTE,
        version: '2023-10-31',
      });
    });
  });

  it('should only accept one `--comment`', async () => {
    await render();
    await enterConsoleCommand(
      renderResult,
      user,
      'execute --command="ls -al" --comment "one" --comment "two"'
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
          command: 'execute',
          agents: ['a.b.c'],
          agentState: {
            'a.b.c': {
              isCompleted: true,
              wasSuccessful: true,
              wasCanceled: false,
              completedAt: '2025',
              errors: undefined,
            },
          },
        },
      };
    apiMocks.responseProvider.actionDetails.mockReturnValue(actionDetailsApiResponseMock);

    await render();
    await enterConsoleCommand(renderResult, user, 'execute --command="ls -l"');

    await waitFor(() => {
      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(renderResult.getByTestId('executeSuccess').textContent).toEqual(
        'Command execution was successful.'
      );
    });

    await waitFor(() => {
      expect(renderResult.getByTestId('executeSuccess').textContent).toEqual(
        'Command execution was successful.Click here to download full output(ZIP file passcode: elastic).Files are periodically deleted to clear storage space. Download and save file locally if needed.'
      );
    });
  });

  it.each(
    Object.keys(endpointActionResponseCodes).filter((key) => key.startsWith('ra_execute_error'))
  )('should display known error message for response failure: %s', async (errorCode) => {
    apiMocks.responseProvider.actionDetails.mockReturnValue({
      data: new EndpointActionGenerator('seed').generateActionDetails({
        command: 'execute',
        errors: ['some error happen in endpoint'],
        wasSuccessful: false,
        outputs: {
          'agent-a': {
            content: {
              code: errorCode,
            },
          },
        },
      }),
    });

    const { getByTestId } = await render();
    await enterConsoleCommand(renderResult, user, 'execute --command="ls -l"');

    await waitFor(() => {
      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getByTestId('execute-actionFailure')).toHaveTextContent(
        endpointActionResponseCodes[errorCode]
      );
    });
  });
});
