/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UserActionParameters } from '../types';
import { WorkflowUserActionBuilder } from './workflow';

describe('WorkflowUserActionBuilder', () => {
  const defaultPayload = {
    workflow: { id: 'wf-1', name: 'My Workflow', executionId: 'exec-1' },
    origin: { type: 'cases.case' as const, id: 'case-1' },
  };

  const builderArgs: UserActionParameters<'workflow'> = {
    action: 'create' as const,
    caseId: 'case-1',
    user: {
      email: 'elastic@elastic.co',
      full_name: 'Elastic User',
      username: 'elastic',
    },
    owner: 'cases',
    payload: defaultPayload,
  };

  let builder: WorkflowUserActionBuilder;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2022-01-09T22:00:00.000Z'));
  });

  beforeEach(() => {
    jest.resetAllMocks();
    builder = new WorkflowUserActionBuilder();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('sets action to create', () => {
    const { parameters } = builder.build(builderArgs);
    expect(parameters.attributes.action).toBe('create');
  });

  it('sets type to workflow', () => {
    const { parameters } = builder.build(builderArgs);
    expect(parameters.attributes.type).toBe('workflow');
  });

  it('stores the full payload', () => {
    const { parameters } = builder.build(builderArgs);
    expect(parameters.attributes.payload).toEqual(defaultPayload);
  });

  it('adds a case reference', () => {
    const { parameters } = builder.build(builderArgs);
    expect(parameters.references).toEqual([
      expect.objectContaining({ type: 'cases', id: 'case-1' }),
    ]);
  });

  it('sets the correct descriptiveAction', () => {
    const { eventDetails } = builder.build(builderArgs);
    expect(eventDetails.descriptiveAction).toBe('case_user_action_run_workflow');
  });

  it('includes the workflow id and case id in the audit message', () => {
    const { eventDetails } = builder.build(builderArgs);
    const message = eventDetails.getMessage('action-id');
    expect(message).toContain('wf-1');
    expect(message).toContain('case-1');
    expect(message).toContain('action-id');
  });
});
