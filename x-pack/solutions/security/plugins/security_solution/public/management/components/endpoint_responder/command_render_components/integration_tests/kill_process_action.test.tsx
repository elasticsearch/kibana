/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppContextTestRender } from '../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../common/mock/endpoint';
import {
  ConsoleManagerTestComponent,
  getConsoleManagerMockRenderResultQueriesAndActions,
} from '../../../console/components/console_manager/mocks';
import React from 'react';
import { getEndpointConsoleCommands } from '../../lib/console_commands_definition';
import { enterConsoleCommand, getConsoleSelectorsAndActionMock } from '../../../console/mocks';
import { waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { responseActionsHttpMocks } from '../../../../mocks/response_actions_http_mocks';
import { getEndpointAuthzInitialState } from '../../../../../../common/endpoint/service/authz';
import type {
  EndpointCapabilities,
  ResponseActionAgentType,
} from '../../../../../../common/endpoint/service/response_actions/constants';
import { ENDPOINT_CAPABILITIES } from '../../../../../../common/endpoint/service/response_actions/constants';
import type {
  ActionDetailsApiResponse,
  KillProcessActionOutputContent,
} from '../../../../../../common/endpoint/types';
import { endpointActionResponseCodes } from '../../lib/endpoint_action_response_codes';
import { UPGRADE_AGENT_FOR_RESPONDER } from '../../../../../common/translations';
import type { CommandDefinition } from '../../../console';

describe('When using the kill-process action from response actions console', () => {
  let user: UserEvent;
  let mockedContext: AppContextTestRender;
  let render: (
    capabilities?: EndpointCapabilities[]
  ) => Promise<ReturnType<AppContextTestRender['render']>>;
  let renderResult: ReturnType<AppContextTestRender['render']>;
  let apiMocks: ReturnType<typeof responseActionsHttpMocks>;
  let consoleManagerMockAccess: ReturnType<
    typeof getConsoleManagerMockRenderResultQueriesAndActions
  >;
  let consoleCommands: CommandDefinition[];
  let consoleSelectors: ReturnType<typeof getConsoleSelectorsAndActionMock>;

  /** Sets the console commands to the `consoleCommands` defined variable above */
  const setConsoleCommands = (
    capabilities: EndpointCapabilities[] = [...ENDPOINT_CAPABILITIES],
    agentType: ResponseActionAgentType = 'endpoint'
  ): void => {
    consoleCommands = getEndpointConsoleCommands({
      agentType,
      endpointAgentId: 'a.b.c',
      endpointCapabilities: capabilities,
      endpointPrivileges: {
        ...getEndpointAuthzInitialState(),
        loading: false,
        canKillProcess: true,
        canSuspendProcess: true,
        canGetRunningProcesses: true,
      },
      platform: 'linux',
    });
  };

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
    setConsoleCommands();

    render = async () => {
      renderResult = mockedContext.render(
        <ConsoleManagerTestComponent
          registerConsoleProps={() => {
            return {
              consoleProps: {
                'data-test-subj': 'test',
                commands: consoleCommands,
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
      consoleSelectors = getConsoleSelectorsAndActionMock(renderResult, user);

      return renderResult;
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error
    consoleSelectors = undefined;
  });

  it('should show an error if the `kill_process` capability is not present in the endpoint', async () => {
    setConsoleCommands([]);
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid 123');

    expect(renderResult.getByTestId('test-validationError-message').textContent).toEqual(
      UPGRADE_AGENT_FOR_RESPONDER('endpoint', 'kill-process')
    );
  });

  it('should call `kill-process` api when command is entered', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid 123');

    await waitFor(() => {
      expect(apiMocks.responseProvider.killProcess).toHaveBeenCalledTimes(1);
    });
  });

  it('should accept an optional `--comment`', async () => {
    await render();
    await enterConsoleCommand(
      renderResult,
      user,
      'kill-process --pid 123 --comment "This is a comment"'
    );

    await waitFor(() => {
      expect(apiMocks.responseProvider.killProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('This is a comment'),
        })
      );
    });
  });

  it('should only accept one `--comment`', async () => {
    await render();
    await enterConsoleCommand(
      renderResult,
      user,
      'kill-process --pid 123 --comment "one" --comment "two"'
    );

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Argument can only be used once: --comment'
    );
  });

  it('should only accept one exclusive argument', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid 123 --entityId 123wer');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'This command supports only one of the following arguments: --entityId, --pid'
    );
  });

  it('should check for at least one exclusive argument', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'This command supports only one of the following arguments: --entityId, --pid'
    );
  });

  it('should check the pid has a given value', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Invalid argument value: --pid. Argument cannot be empty'
    );
  });

  it('should check the pid has a non-empty value', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid "   "');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Invalid argument value: --pid. Argument cannot be empty'
    );
  });

  it('should check the pid has a non-negative value', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid -123');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Invalid argument value: --pid. Argument must be a positive number representing the PID of a process'
    );
  });

  it('should check the pid is a number', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid asd');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Invalid argument value: --pid. Argument must be a positive number representing the PID of a process'
    );
  });

  it('should check the pid is a safe number', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid 123123123123123123123');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Invalid argument value: --pid. Argument must be a positive number representing the PID of a process'
    );
  });

  it('should check the entityId has a given value', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --entityId');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Invalid argument value: --entityId. Argument cannot be empty'
    );
  });

  it('should check the entity id has a non-empty value', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --entityId "   "');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Invalid argument value: --entityId. Argument cannot be empty'
    );
  });

  it('should call the action status api after creating the `kill-process` request', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid 123');

    await waitFor(() => {
      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalled();
    });
  });

  it('should show success when `kill-process` action completes with no errors when using `pid`', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid 123');

    await waitFor(() => {
      expect(renderResult.getByTestId('killProcess-success')).toBeTruthy();
    });
  });

  it('should show success when `kill-process` action completes with no errors when using `entityId`', async () => {
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --entityId 123wer');

    await waitFor(() => {
      expect(renderResult.getByTestId('killProcess-success')).toBeTruthy();
    });
  });

  it('should show error if kill-process failed to complete successfully', async () => {
    const pendingDetailResponse = apiMocks.responseProvider.actionDetails({
      path: '/api/endpoint/action/1.2.3',
    });
    pendingDetailResponse.data.command = 'kill-process';
    pendingDetailResponse.data.wasSuccessful = false;
    pendingDetailResponse.data.errors = ['error one', 'error two'];
    pendingDetailResponse.data.agentState = {
      'agent-a': {
        isCompleted: true,
        wasSuccessful: false,
        wasCanceled: false,
        errors: ['error one', 'error two'],
        completedAt: new Date().toISOString(),
      },
    };
    apiMocks.responseProvider.actionDetails.mockReturnValue(pendingDetailResponse);
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid 123');

    await waitFor(() => {
      expect(renderResult.getByTestId('killProcess-actionFailure').textContent).toMatch(
        /error one \| error two/
      );
    });
  });

  it.each([['ra_kill-process_error_not-found'], ['ra_kill-process_error_not-permitted']])(
    'should show detailed error if kill-process failure returned code: %s',
    async (outputCode) => {
      const pendingDetailResponse = apiMocks.responseProvider.actionDetails({
        path: '/api/endpoint/action/a.b.c',
      }) as ActionDetailsApiResponse<KillProcessActionOutputContent>;
      pendingDetailResponse.data.command = 'kill-process';
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
          },
        },
      };
      apiMocks.responseProvider.actionDetails.mockReturnValue(pendingDetailResponse);
      await render();
      await enterConsoleCommand(renderResult, user, 'kill-process --pid 123');

      await waitFor(() => {
        expect(renderResult.getByTestId('killProcess-actionFailure').textContent).toMatch(
          new RegExp(endpointActionResponseCodes[outputCode])
        );
      });
    }
  );

  it('should show error if kill-process API fails', async () => {
    apiMocks.responseProvider.killProcess.mockRejectedValueOnce({
      status: 500,
      message: 'this is an error',
    } as never);
    await render();
    await enterConsoleCommand(renderResult, user, 'kill-process --pid 123');

    await waitFor(() => {
      expect(renderResult.getByTestId('killProcess-apiFailure').textContent).toMatch(
        /this is an error/
      );
    });
  });

  describe('and when console is closed (not terminated) and then reopened', () => {
    beforeEach(() => {
      const _render = render;

      render = async () => {
        const response = await _render();
        await enterConsoleCommand(response, user, 'kill-process --pid 123');

        await waitFor(() => {
          expect(apiMocks.responseProvider.killProcess).toHaveBeenCalledTimes(1);
          expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalledTimes(1);
        });

        // Hide the console
        await consoleManagerMockAccess.hideOpenedConsole();

        return response;
      };
    });

    it('should NOT send the `kill-process` request again', async () => {
      await render();
      await consoleManagerMockAccess.openRunningConsole();

      expect(apiMocks.responseProvider.killProcess).toHaveBeenCalledTimes(1);
    });

    it('should continue to check action status when still pending', async () => {
      const pendingDetailResponse = apiMocks.responseProvider.actionDetails({
        path: '/api/endpoint/action/1.2.3',
      });

      pendingDetailResponse.data.command = 'kill-process';
      pendingDetailResponse.data.isCompleted = false;
      apiMocks.responseProvider.actionDetails.mockClear();
      apiMocks.responseProvider.actionDetails.mockReturnValue(pendingDetailResponse);

      await render();

      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalledTimes(1);

      await consoleManagerMockAccess.openRunningConsole();

      await waitFor(() => {
        expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalledTimes(2);
      });
    });

    it('should display completion output if done (no additional API calls)', async () => {
      await render();

      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalledTimes(1);

      await consoleManagerMockAccess.openRunningConsole();

      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalledTimes(1);
    });
  });

  describe('and the agent type is `SentinelOne`', () => {
    beforeEach(() => {
      setConsoleCommands(undefined, 'sentinel_one');
    });

    it('should display correct help data', async () => {
      await render();
      await enterConsoleCommand(renderResult, user, 'kill-process --help');

      await waitFor(() => {
        expect(renderResult.getByTestId('test-helpOutput')).toHaveTextContent(
          'About' +
            'Kill/terminate a process' +
            'Usage' +
            'kill-process --processName [--comment]' +
            'Required parameters--processName - The process name to kill' +
            'Optional parameters--comment - A comment to go along with the action' +
            'Example' +
            'kill-process --processName="notepad" --comment="kill malware"'
        );
      });
    });

    it('should display correct entry in help panel', async () => {
      await render();
      consoleSelectors.openHelpPanel();

      expect(
        renderResult.getByTestId('test-commandList-Responseactions-kill-process')
      ).toHaveTextContent('kill-process --processNameKill/terminate a process');
    });

    it('should only accept processName argument', async () => {
      await render();
      await enterConsoleCommand(renderResult, user, 'kill-process --pid=9');
    });

    it.each`
      description                              | command
      ${'no argument is entered'}              | ${'kill-process'}
      ${'no value provided for processName'}   | ${'kill-process --processName'}
      ${'empty value provided to processName'} | ${'kill-process --processName=" "'}
    `('should error when $description', async ({ command }) => {
      await render();
      await enterConsoleCommand(renderResult, user, command);

      expect(renderResult.getByTestId('test-badArgument')).toHaveTextContent(
        'Unsupported argument'
      );
    });

    it('should call API with correct payload for SentinelOne kill-process', async () => {
      apiMocks.responseProvider.killProcess.mockDelay.mockImplementation(
        () => new Promise((r) => setTimeout(r, 100))
      );
      await render();
      await enterConsoleCommand(
        renderResult,
        user,
        'kill-process --processName="notepad" --comment="some comment"'
      );

      expect(renderResult.getByTestId('killProcess-pending'));

      await waitFor(() => {
        expect(apiMocks.responseProvider.killProcess).toHaveBeenCalledWith(
          expect.objectContaining({
            body: JSON.stringify({
              agent_type: 'sentinel_one',
              endpoint_ids: ['a.b.c'],
              comment: 'some comment',
              parameters: {
                process_name: 'notepad',
              },
            }),
          })
        );
      });
    });
  });
});
