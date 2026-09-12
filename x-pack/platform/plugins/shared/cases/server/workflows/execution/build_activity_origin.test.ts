/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildActivityOrigin } from './build_activity_origin';
import {
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
  CASE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
} from '../../../common/types/domain/user_action/workflow/constants';
import type { Case } from '../../../common/types/domain';

const makeCase = (overrides: Partial<Case> = {}): Case =>
  ({
    id: 'case-1',
    owner: 'securitySolution',
    observables: [],
    comments: [],
    ...overrides,
  } as unknown as Case);

describe('buildActivityOrigin', () => {
  it('returns undefined without an origin', () => {
    expect(buildActivityOrigin({ origin: undefined })).toBeUndefined();
  });

  it('maps a case origin', () => {
    expect(
      buildActivityOrigin({
        origin: { type: CASE_WORKFLOW_ORIGIN_TYPE, caseId: 'case-1' },
        theCase: makeCase(),
      })
    ).toEqual({ type: CASE_WORKFLOW_ORIGIN_TYPE, id: 'case-1' });
  });

  it('enriches a singular attachment origin with trusted resolver metadata', () => {
    expect(
      buildActivityOrigin({
        origin: {
          type: ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'alert-1',
        },
        resolvedAttachmentOrigin: {
          targets: [{ id: 'alert-1', index: '.alerts-security.alerts-default' }],
        },
      })
    ).toEqual({
      type: ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
      id: 'alert-1',
      attachmentType: 'security.alert',
      index: '.alerts-security.alerts-default',
    });
  });

  it('maps a bulk attachment origin with its count', () => {
    expect(
      buildActivityOrigin({
        origin: {
          type: ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentIds: ['alert-1', 'alert-2'],
        },
        resolvedAttachmentOrigin: {
          targets: [{ id: 'alert-1' }, { id: 'alert-2' }],
        },
      })
    ).toEqual({
      type: ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
      id: 'case-1',
      attachmentType: 'security.alert',
      count: 2,
    });
  });

  it('enriches a singular observable from the case', () => {
    const theCase = makeCase({
      observables: [
        {
          id: 'observable-1',
          typeKey: 'ip',
          value: '1.2.3.4',
        },
      ] as Case['observables'],
    });

    expect(
      buildActivityOrigin({
        origin: {
          type: OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
          caseId: 'case-1',
          observableId: 'observable-1',
        },
        theCase,
      })
    ).toEqual({
      type: OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
      id: 'observable-1',
      typeKey: 'ip',
      value: '1.2.3.4',
    });
  });

  it('maps a bulk observable origin with its count', () => {
    expect(
      buildActivityOrigin({
        origin: {
          type: OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
          caseId: 'case-1',
          observableIds: ['observable-1', 'observable-2'],
        },
        theCase: makeCase(),
      })
    ).toEqual({
      type: OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
      id: 'case-1',
      count: 2,
    });
  });
});
