/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppContextTestRender } from '../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../common/mock/endpoint';
import type {
  ActionDetails,
  ResponseActionMemoryDumpOutputContent,
  ResponseActionMemoryDumpParameters,
} from '../../../../common/endpoint/types';
import { EndpointActionGenerator } from '../../../../common/endpoint/data_generators/endpoint_action_generator';
import React from 'react';
import { MemoryDumpResponseActionOutputResult } from './memory_dump_response_action_output_result';
import { RESPONSE_ACTION_STATUS } from '../../common/translations';

describe('MemoryDumpResponseActionOutputResult component', () => {
  let appTestContext: AppContextTestRender;
  let renderResult: ReturnType<AppContextTestRender['render']>;
  let render: () => ReturnType<AppContextTestRender['render']>;
  let action: ActionDetails<
    ResponseActionMemoryDumpOutputContent,
    ResponseActionMemoryDumpParameters
  >;
  let agentId: string | undefined;

  beforeEach(() => {
    const generator = new EndpointActionGenerator('seed');

    appTestContext = createAppRootMockRenderer();
    action = generator.generateActionDetails<
      ResponseActionMemoryDumpOutputContent,
      ResponseActionMemoryDumpParameters
    >({
      command: 'memory-dump',
      isCompleted: true,
      isExpired: false,
      agentType: 'endpoint',
      status: 'successful',
    });

    agentId = action.agents[0];

    // Add a second agent id to the action
    action.agents.unshift('agent-2');
    action.agentState['agent-2'] = {
      isCompleted: true,
      wasSuccessful: true,
      wasCanceled: false,
      errors: undefined,
      completedAt: new Date().toISOString(),
    };
    // @ts-expect-error
    action.outputs['agent-2'] = {
      type: 'json',
      content: {
        code: 'ra_memory_dump_success',
        path: '/home/user/agent-2/tmp/memory-dump.2025-11-03T16:22:05.365Z.zip',
        file_size: 22790,
        disk_free_space: 1150000,
      },
    };

    render = () => {
      renderResult = appTestContext.render(
        <MemoryDumpResponseActionOutputResult
          action={action}
          agentId={agentId}
          data-test-subj="test"
        />
      );

      return renderResult;
    };
  });

  it('should render successful output', () => {
    const { getByTestId } = render();

    expect(getByTestId('test').textContent).toEqual(
      'Memory dump file was created on host:' +
        `File: /home/user/${agentId}/tmp/memory-dump.2025-11-03T16:22:05.365Z.zip` +
        'Size: 22.79MB' +
        'Disk free space: 1.15GB'
    );
  });

  it('should display pending if action not complete yet for agent id', () => {
    action.isCompleted = false;
    action.agentState[agentId!] = {
      isCompleted: false,
      wasSuccessful: false,
      wasCanceled: false,
      errors: undefined,
      completedAt: undefined,
    };
    const { getByTestId } = render();

    expect(getByTestId('test').textContent).toEqual(RESPONSE_ACTION_STATUS.pendingMessage);
  });

  it('should render failure output', () => {
    action.isCompleted = true;
    action.wasSuccessful = false;
    action.status = 'failed';
    action.errors = ['Error info A'];
    action.agentState[agentId!] = {
      isCompleted: true,
      wasSuccessful: false,
      wasCanceled: false,
      errors: ['Error info A'],
      completedAt: new Date().toISOString(),
    };
    const { getByTestId } = render();

    expect(getByTestId('test').textContent).toEqual(
      'The following error was encountered:Host: Host-agent-aErrors: Error info A'
    );
  });

  it('should render output for first agent if one is not provided', () => {
    agentId = undefined;
    const { getByTestId } = render();

    expect(getByTestId('test').textContent).toEqual(
      'Memory dump file was created on host:' +
        'File: /home/user/agent-2/tmp/memory-dump.2025-11-03T16:22:05.365Z.zip' +
        'Size: 22.26KB' +
        'Disk free space: 1.10MB'
    );
  });

  it('should display nothing if agentId provided is not in the action', () => {
    agentId = 'not-in-action';
    const { getByTestId } = render();

    expect(getByTestId('test').textContent).toEqual('');
  });
});
