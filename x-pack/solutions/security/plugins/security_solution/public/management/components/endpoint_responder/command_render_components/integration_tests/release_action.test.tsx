/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAppRootMockRenderer } from '../../../../../common/mock/endpoint';
import {
  ConsoleManagerTestComponent,
  getConsoleManagerMockRenderResultQueriesAndActions,
} from '../../../console/components/console_manager/mocks';
import React from 'react';
import { getEndpointConsoleCommands } from '../../lib/console_commands_definition';
import { enterConsoleCommand } from '../../../console/mocks';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { responseActionsHttpMocks } from '../../../../mocks/response_actions_http_mocks';
import { getEndpointAuthzInitialState } from '../../../../../../common/endpoint/service/authz';
import type { EndpointCapabilities } from '../../../../../../common/endpoint/service/response_actions/constants';
import { ENDPOINT_CAPABILITIES } from '../../../../../../common/endpoint/service/response_actions/constants';
import { UPGRADE_AGENT_FOR_RESPONDER } from '../../../../../common/translations';

jest.mock('../../../../../common/experimental_features_service');

const prepareTest = () => {
  // Workaround for timeout via https://github.com/testing-library/user-event/issues/833#issuecomment-1171452841
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const mockedContext = createAppRootMockRenderer();

  const apiMocks = responseActionsHttpMocks(mockedContext.coreStart.http);

  const render = async (capabilities: EndpointCapabilities[] = [...ENDPOINT_CAPABILITIES]) => {
    const renderResult = mockedContext.render(
      <ConsoleManagerTestComponent
        registerConsoleProps={() => {
          return {
            consoleProps: {
              'data-test-subj': 'test',
              commands: getEndpointConsoleCommands({
                agentType: 'endpoint',
                endpointAgentId: 'a.b.c',
                endpointCapabilities: [...capabilities],
                endpointPrivileges: {
                  ...getEndpointAuthzInitialState(),
                  canUnIsolateHost: true,
                  loading: false,
                },
                platform: 'linux',
              }),
            },
          };
        }}
      />
    );

    const consoleManagerMockAccess = getConsoleManagerMockRenderResultQueriesAndActions(
      user,
      renderResult
    );

    await consoleManagerMockAccess.clickOnRegisterNewConsole();
    await consoleManagerMockAccess.openRunningConsole();

    return { consoleManagerMockAccess, renderResult };
  };

  return { apiMocks, render, user };
};

const prepareTestConsoleClosed = async () => {
  const { apiMocks, render: _render, user } = prepareTest();

  const render = async () => {
    const { consoleManagerMockAccess, renderResult } = await _render();
    await enterConsoleCommand(renderResult, user, 'release');

    await waitFor(() => {
      expect(apiMocks.responseProvider.releaseHost).toHaveBeenCalledTimes(1);
      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalledTimes(1);
    });

    // Hide the console
    await consoleManagerMockAccess.hideOpenedConsole();

    return { consoleManagerMockAccess, renderResult };
  };

  return { apiMocks, render, user };
};

describe('When using the release action from response actions console', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should show an error if the `isolation` capability is not present in the endpoint', async () => {
    const { render, user } = prepareTest();
    const { renderResult } = await render([]);
    await enterConsoleCommand(renderResult, user, 'release');

    await waitFor(() => {
      expect(renderResult.getByTestId('test-validationError-message').textContent).toEqual(
        UPGRADE_AGENT_FOR_RESPONDER('endpoint', 'release')
      );
    });
  });

  it('should call `release` api when command is entered', async () => {
    const { apiMocks, render, user } = prepareTest();
    const { renderResult } = await render();
    await enterConsoleCommand(renderResult, user, 'release');

    await waitFor(() => {
      expect(apiMocks.responseProvider.releaseHost).toHaveBeenCalledTimes(1);
      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalled();
    });
  });

  it('should accept an optional `--comment`', async () => {
    const { apiMocks, render, user } = prepareTest();
    const { renderResult } = await render();
    await enterConsoleCommand(renderResult, user, 'release --comment "This is a comment"');

    await waitFor(() => {
      expect(apiMocks.responseProvider.releaseHost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('This is a comment'),
        })
      );
    });
  });

  it('should only accept one `--comment`', async () => {
    const { render, user } = prepareTest();
    const { renderResult } = await render();
    await enterConsoleCommand(renderResult, user, 'release --comment "one" --comment "two"');

    expect(renderResult.getByTestId('test-badArgument-message').textContent).toEqual(
      'Argument can only be used once: --comment'
    );
  });

  it('should call the action status api after creating the `release` request', async () => {
    const { apiMocks, render, user } = prepareTest();
    const { renderResult } = await render();
    await enterConsoleCommand(renderResult, user, 'release');

    await waitFor(() => {
      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalled();
    });
  });

  it('should show success when `release` action completes with no errors', async () => {
    const { render, user } = prepareTest();
    const { renderResult } = await render();
    await enterConsoleCommand(renderResult, user, 'release');

    await waitFor(() => {
      expect(renderResult.getByTestId('release-success')).toBeTruthy();
    });
  });

  it('should show error if release failed to complete successfully', async () => {
    const { apiMocks, render, user } = prepareTest();
    const { renderResult } = await render();

    const pendingDetailResponse = apiMocks.responseProvider.actionDetails({
      path: '/api/endpoint/action/1.2.3',
    });
    pendingDetailResponse.data.command = 'unisolate';
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

    await enterConsoleCommand(renderResult, user, 'release');

    await waitFor(() => {
      expect(renderResult.getByTestId('release-actionFailure').textContent).toMatch(
        /error one \| error two/
      );
    });
  });

  // TODO The last assertion fails after the update to user-event v14 https://github.com/elastic/kibana/pull/189949
  it.skip('should create action request and store id even if console is closed prior to request api response', async () => {
    const { apiMocks, render, user } = prepareTest();
    const { consoleManagerMockAccess, renderResult } = await render();

    apiMocks.responseProvider.releaseHost.mockImplementation(
      // @ts-expect-error This satisfies the test, but the type is incorrect
      () => new Promise((resolve) => setTimeout(() => resolve(), 500))
    );
    apiMocks.responseProvider.actionDetails.mockImplementation(
      // @ts-expect-error This satisfies the test, but the type is incorrect
      () => new Promise((resolve) => setTimeout(() => resolve(), 500))
    );

    // enter command
    await enterConsoleCommand(renderResult, user, 'release');
    // hide console
    await consoleManagerMockAccess.hideOpenedConsole();

    // Release API response
    jest.advanceTimersByTime(510);
    await waitFor(() => {
      expect(apiMocks.responseProvider.releaseHost).toHaveBeenCalledTimes(1);
    });

    // open console
    await consoleManagerMockAccess.openRunningConsole();
    // status should be updating
    await waitFor(() => {
      expect(apiMocks.responseProvider.actionDetails.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('and when console is closed (not terminated) and then reopened', () => {
    it('should NOT send the `release` request again', async () => {
      const { apiMocks, render } = await prepareTestConsoleClosed();
      const { consoleManagerMockAccess } = await render();
      await consoleManagerMockAccess.openRunningConsole();

      expect(apiMocks.responseProvider.releaseHost).toHaveBeenCalledTimes(1);
    });

    it('should continue to check action status when still pending', async () => {
      const { apiMocks, render } = await prepareTestConsoleClosed();

      const pendingDetailResponse = apiMocks.responseProvider.actionDetails({
        path: '/api/endpoint/action/1.2.3',
      });
      pendingDetailResponse.data.command = 'unisolate';
      pendingDetailResponse.data.isCompleted = false;
      apiMocks.responseProvider.actionDetails.mockClear();
      apiMocks.responseProvider.actionDetails.mockReturnValue(pendingDetailResponse);

      const { consoleManagerMockAccess } = await render();

      expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalledTimes(1);

      await consoleManagerMockAccess.openRunningConsole();

      await waitFor(() => {
        expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalledTimes(2);
      });
    });

    it('should display completion output if done (no additional API calls)', async () => {
      const { apiMocks, render } = await prepareTestConsoleClosed();
      const { consoleManagerMockAccess } = await render();
      await waitFor(() => {
        expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalledTimes(1);
      });

      await consoleManagerMockAccess.openRunningConsole();
      await waitFor(() => {
        expect(apiMocks.responseProvider.actionDetails).toHaveBeenCalledTimes(1);
      });
    });
  });
});
