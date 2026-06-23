/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppContextTestRender } from '../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../common/mock/endpoint';
import { EndpointUploadActionResult } from './endpoint_upload_action_result';
import type {
  ActionDetails,
  ResponseActionUploadOutputContent,
  ResponseActionUploadParameters,
} from '../../../../common/endpoint/types';
import React from 'react';
import { EndpointActionGenerator } from '../../../../common/endpoint/data_generators/endpoint_action_generator';

describe('Endpoint Upload Action Result component', () => {
  let appTestContext: AppContextTestRender;
  let renderResult: ReturnType<AppContextTestRender['render']>;
  let render: () => ReturnType<AppContextTestRender['render']>;
  let action: ActionDetails<ResponseActionUploadOutputContent, ResponseActionUploadParameters>;
  let agentId: string | undefined;

  const addAgentToAction = () => {
    action.agents.push('agent-b');
    action.outputs!['agent-b'] = {
      type: 'json',
      content: {
        code: 'ra_upload_file-success',
        path: '/path/to/uploaded/file',
        disk_free_space: 1234567,
      },
    };
    action.agentState['agent-b'] = {
      wasSuccessful: true,
      isCompleted: true,
      wasCanceled: false,
      completedAt: new Date().toISOString(),
      errors: undefined,
    };
    action.hosts['agent-b'] = {
      name: 'agent-b',
    };
  };

  beforeEach(() => {
    appTestContext = createAppRootMockRenderer();
    agentId = undefined;
    action = new EndpointActionGenerator('seed').generateActionDetails<
      ResponseActionUploadOutputContent,
      ResponseActionUploadParameters
    >({
      command: 'upload',
    });

    render = () => {
      renderResult = appTestContext.render(
        <EndpointUploadActionResult action={action} agentId={agentId} data-test-subj="test" />
      );

      return renderResult;
    };
  });

  it('should show success action result for single agent', () => {
    agentId = action.agents.at(0);
    const { getByTestId } = render();

    expect(getByTestId('test')).toHaveTextContent(
      'File saved to: /path/to/uploaded/fileFree disk space on drive: 1.18MB'
    );
  });

  it('should show success action result for multiple agents', () => {
    addAgentToAction();
    const { getByTestId } = render();

    expect(getByTestId('test')).toHaveTextContent(
      'Host: Host-agent-aFile saved to: /path/to/uploaded/fileFree disk space on drive: 1.18MB' +
        'Host: agent-bFile saved to: /path/to/uploaded/fileFree disk space on drive: 1.18MB'
    );
  });

  it('should render nothing if action is not `upload`', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn');
    action.command = 'isolate';
    const { queryByTestId } = render();

    expect(queryByTestId('test')).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'EndpointUploadActionResult: called with a non-upload action'
    );
  });

  it('should show pending if no response was received yet', () => {
    action.isCompleted = false;
    action.agentState['agent-a'].isCompleted = false;
    const { getByTestId } = render();

    expect(getByTestId('test')).toHaveTextContent('Action pending.');
  });

  it('should show error for agent responses that failed when multi-agent action', () => {
    addAgentToAction();
    // Set the second agent to be at error
    action.agentState['agent-b'].wasSuccessful = false;
    action.agentState['agent-b'].errors = ['some error here'];
    action.errors = ['some error here'];
    action.wasSuccessful = false;
    const { getByTestId } = render();

    expect(getByTestId('test')).toHaveTextContent(
      'Host: Host-agent-aFile saved to: /path/to/uploaded/fileFree disk space on drive: 1.18MB' +
        'Host: agent-bThe following error was encountered:Host: agent-bErrors: some error here'
    );
  });
});
