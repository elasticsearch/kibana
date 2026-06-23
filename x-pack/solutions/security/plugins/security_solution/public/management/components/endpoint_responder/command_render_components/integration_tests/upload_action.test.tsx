/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ENDPOINT_CAPABILITIES,
  type EndpointCapabilities,
} from '../../../../../../common/endpoint/service/response_actions/constants';
import {
  type AppContextTestRender,
  createAppRootMockRenderer,
} from '../../../../../common/mock/endpoint';
import { responseActionsHttpMocks } from '../../../../mocks/response_actions_http_mocks';
import {
  ConsoleManagerTestComponent,
  getConsoleManagerMockRenderResultQueriesAndActions,
} from '../../../console/components/console_manager/mocks';
import type {
  ActionDetailsApiResponse,
  EndpointPrivileges,
  ResponseActionUploadOutputContent,
} from '../../../../../../common/endpoint/types';
import { getEndpointAuthzInitialStateMock } from '../../../../../../common/endpoint/service/authz/mocks';
import { getEndpointConsoleCommands } from '../..';
import React from 'react';
import { getConsoleSelectorsAndActionMock } from '../../../console/mocks';
import { waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { executionTranslations } from '../../../console/components/console_state/state_update_handlers/translations';
import { UPLOAD_ROUTE } from '../../../../../../common/endpoint/constants';
import type { HttpFetchOptionsWithPath } from '@kbn/core-http-browser';
import {
  INSUFFICIENT_PRIVILEGES_FOR_COMMAND,
  UPGRADE_AGENT_FOR_RESPONDER,
} from '../../../../../common/translations';
import { endpointActionResponseCodes } from '../../lib/endpoint_action_response_codes';

// TODO These tests need revisting, they are not finishing
// upgrade to user-event v14 https://github.com/elastic/kibana/pull/189949
describe.skip('When using `upload` response action', () => {
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
  let endpointCapabilities: typeof ENDPOINT_CAPABILITIES;
  let file: File;
  let console: ReturnType<typeof getConsoleSelectorsAndActionMock>;

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
    endpointCapabilities = [...ENDPOINT_CAPABILITIES];

    const fileContent = new Blob(['test']);
    file = new File([fileContent], 'test.json', { type: 'application/JSON' });

    render = async () => {
      renderResult = mockedContext.render(
        <ConsoleManagerTestComponent
          registerConsoleProps={() => {
            return {
              consoleProps: {
                'data-test-subj': 'test',
                commands: getEndpointConsoleCommands({
                  agentType: 'endpoint',
                  endpointAgentId: 'a.b.c',
                  endpointCapabilities,
                  endpointPrivileges,
                  platform: 'linux',
                }),
              },
            };
          }}
        />
      );

      console = getConsoleSelectorsAndActionMock(renderResult, user);
      consoleManagerMockAccess = getConsoleManagerMockRenderResultQueriesAndActions(
        user,
        renderResult
      );

      await consoleManagerMockAccess.clickOnRegisterNewConsole();
      await consoleManagerMockAccess.openRunningConsole();

      return renderResult;
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error assignment of `undefined` to avoid leak from one test to the other
    console = undefined;
    // @ts-expect-error assignment of `undefined` to avoid leak from one test to the other
    consoleManagerMockAccess = undefined;
  });

  it('should require `--file` argument', async () => {
    await render();
    console.enterCommand('upload');

    await waitFor(() => {
      expect(renderResult.getByTestId('test-badArgument-message')).toHaveTextContent(
        executionTranslations.missingArguments('--file')
      );
    });
  });

  it('should error if `--file` argument is not set (no file selected)', async () => {
    await render();
    console.enterCommand('upload --file');

    await waitFor(() => {
      expect(renderResult.getByTestId('test-badArgument-message')).toHaveTextContent(
        executionTranslations.mustHaveValue('file')
      );
    });
  });

  it('should call upload api with expected payload', async () => {
    const { getByTestId } = await render();
    console.enterCommand('upload --file', { inputOnly: true });

    await user.upload(getByTestId('console-arg-file-picker'), file);

    console.submitCommand();

    await waitFor(() => {
      expect(apiMocks.responseProvider.upload).toHaveBeenCalledWith({
        body: expect.any(FormData),
        headers: {
          'Content-Type': undefined,
        },
        path: UPLOAD_ROUTE,
        version: '2023-10-31',
      });
    });

    const apiBody = (
      apiMocks.responseProvider.upload.mock.lastCall as unknown as [HttpFetchOptionsWithPath]
    )?.[0].body as FormData;

    expect(apiBody.get('file')).toEqual(file);
    expect(apiBody.get('endpoint_ids')).toEqual('["a.b.c"]');
    expect(apiBody.get('parameters')).toEqual('{}');
  });

  it('should allow `--overwrite` argument', async () => {
    const { getByTestId } = await render();
    console.enterCommand('upload --overwrite --file', { inputOnly: true });

    await user.upload(getByTestId('console-arg-file-picker'), file);

    console.submitCommand();

    await waitFor(() => {
      expect(apiMocks.responseProvider.upload).toHaveBeenCalled();
    });

    const apiBody = (
      apiMocks.responseProvider.upload.mock.lastCall as unknown as [HttpFetchOptionsWithPath]
    )?.[0].body as FormData;

    expect(apiBody.get('parameters')).toEqual('{"overwrite":true}');
  });

  it('should show an error if user has no authz to file operations', async () => {
    endpointPrivileges.canWriteFileOperations = false;
    const { getByTestId } = await render();
    console.enterCommand('upload --overwrite --file', { inputOnly: true });

    await user.upload(getByTestId('console-arg-file-picker'), file);

    console.submitCommand();

    await waitFor(() => {
      expect(getByTestId('test-validationError-message').textContent).toEqual(
        INSUFFICIENT_PRIVILEGES_FOR_COMMAND
      );
    });
  });

  it('should show an error if the endpoint does not support `upload_file` capability', async () => {
    endpointCapabilities = [] as unknown as typeof ENDPOINT_CAPABILITIES;
    const { getByTestId } = await render();
    console.enterCommand('upload --overwrite --file', { inputOnly: true });

    await user.upload(getByTestId('console-arg-file-picker'), file);

    console.submitCommand();

    await waitFor(() => {
      expect(getByTestId('test-validationError-message').textContent).toEqual(
        UPGRADE_AGENT_FOR_RESPONDER('endpoint', 'upload')
      );
    });
  });

  it.each([
    'ra_upload_error_canceled',
    'ra_upload_error_failure',
    'ra_upload_error_already-exists',
    'ra_upload_error_not-found',
    'ra_upload_error_not-permitted',
    'ra_upload_error_too-big',
    'ra_upload_error_queue-timeout',
    'ra_upload_error_download-failed',
    'ra_upload_error_not-enough-free-space',
  ])('should show detailed error if upload failure returned code: %s', async (outputCode) => {
    const pendingDetailResponse = apiMocks.responseProvider.actionDetails({
      path: '/api/endpoint/action/a.b.c',
    }) as ActionDetailsApiResponse<ResponseActionUploadOutputContent>;
    pendingDetailResponse.data.command = 'upload';
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
        } as unknown as ResponseActionUploadOutputContent,
      },
    };
    apiMocks.responseProvider.actionDetails.mockReturnValue(pendingDetailResponse);
    await render();

    console.enterCommand('upload --file', { inputOnly: true });
    await user.upload(renderResult.getByTestId('console-arg-file-picker'), file);

    console.submitCommand();

    await waitFor(() => {
      expect(renderResult.getByTestId('upload-actionFailure').textContent).toMatch(
        // RegExp below taken from: https://github.com/sindresorhus/escape-string-regexp/blob/main/index.js
        new RegExp(endpointActionResponseCodes[outputCode].replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'))
      );
    });
  });
});
