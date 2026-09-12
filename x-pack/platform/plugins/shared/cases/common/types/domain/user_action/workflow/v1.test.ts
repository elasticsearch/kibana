/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { UserActionTypes } from '../action/v1';
import {
  WorkflowPayloadRt,
  WorkflowOriginRt,
  WorkflowUserActionPayloadRt,
  WorkflowUserActionRt,
} from './v1';
import {
  CASE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
} from './constants';

const defaultWorkflow = { id: 'wf-1', name: 'My Workflow', executionId: 'exec-1' };
const caseOrigin = { type: CASE_WORKFLOW_ORIGIN_TYPE, id: 'case-1' };
const observableOrigin = {
  type: OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
  id: 'obs-1',
  typeKey: 'ip',
  value: '1.2.3.4',
};

describe('WorkflowPayloadRt', () => {
  it('accepts a valid workflow payload', () => {
    expect(WorkflowPayloadRt.decode(defaultWorkflow)).toStrictEqual({
      _tag: 'Right',
      right: defaultWorkflow,
    });
  });

  it('strips excess keys', () => {
    expect(WorkflowPayloadRt.decode({ ...defaultWorkflow, extra: 'nope' })).toStrictEqual({
      _tag: 'Right',
      right: defaultWorkflow,
    });
  });
});

describe('WorkflowOriginRt', () => {
  it.each([
    ['cases.case', caseOrigin],
    ['cases.observable', observableOrigin],
    [
      'cases.attachment',
      {
        type: ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
        id: 'alert-1',
        attachmentType: 'security.alert',
        index: '.alerts-security.alerts-default',
      },
    ],
    [
      'cases.attachments',
      {
        type: ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
        id: 'case-1',
        attachmentType: 'security.alert',
        count: 2,
      },
    ],
  ] as const)('accepts origin type %s', (_label, origin) => {
    const result = WorkflowOriginRt.decode(origin);
    expect(result._tag).toBe('Right');
  });

  it('strips excess keys', () => {
    expect(WorkflowOriginRt.decode({ ...caseOrigin, unknown: 'field' })).toStrictEqual({
      _tag: 'Right',
      right: caseOrigin,
    });
  });

  it('rejects an unknown origin type', () => {
    const result = WorkflowOriginRt.decode({ type: 'cases.unknown', id: 'x' });
    expect(result._tag).toBe('Left');
  });

  it('rejects the removed cases.comment origin', () => {
    const result = WorkflowOriginRt.decode({ type: 'cases.comment', id: 'x' });
    expect(result._tag).toBe('Left');
  });

  it.each(['cases.alert', 'cases.alerts', 'cases.event'])(
    'rejects removed origin type %s',
    (type) => {
      const result = WorkflowOriginRt.decode({ type, id: 'x' });
      expect(result._tag).toBe('Left');
    }
  );
});

describe('WorkflowUserActionPayloadRt', () => {
  const defaultPayload = { workflow: defaultWorkflow, origin: caseOrigin };

  it('has expected attributes', () => {
    expect(WorkflowUserActionPayloadRt.decode(defaultPayload)).toStrictEqual({
      _tag: 'Right',
      right: defaultPayload,
    });
  });

  it('accepts a payload without an origin for list-surface runs', () => {
    const payload = { workflow: defaultWorkflow };
    expect(WorkflowUserActionPayloadRt.decode(payload)).toStrictEqual({
      _tag: 'Right',
      right: payload,
    });
  });

  it('removes foo:bar attributes from payload', () => {
    expect(WorkflowUserActionPayloadRt.decode({ ...defaultPayload, foo: 'bar' })).toStrictEqual({
      _tag: 'Right',
      right: defaultPayload,
    });
  });
});

describe('WorkflowUserActionRt', () => {
  const defaultRequest = {
    type: UserActionTypes.workflow,
    payload: { workflow: defaultWorkflow, origin: caseOrigin },
  };

  it('has expected attributes', () => {
    expect(WorkflowUserActionRt.decode(defaultRequest)).toStrictEqual({
      _tag: 'Right',
      right: defaultRequest,
    });
  });

  it('strips excess keys at the top level', () => {
    expect(WorkflowUserActionRt.decode({ ...defaultRequest, foo: 'bar' })).toStrictEqual({
      _tag: 'Right',
      right: defaultRequest,
    });
  });

  it('strips excess keys inside payload', () => {
    expect(
      WorkflowUserActionRt.decode({
        ...defaultRequest,
        payload: { ...defaultRequest.payload, foo: 'bar' },
      })
    ).toStrictEqual({
      _tag: 'Right',
      right: defaultRequest,
    });
  });
});
