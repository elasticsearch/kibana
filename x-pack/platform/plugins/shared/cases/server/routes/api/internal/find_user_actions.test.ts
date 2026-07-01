/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { findUserActionsRoute } from './find_user_actions';

const userActionsMockData = {
  userActions: [
    {
      type: 'create_case',
      payload: {
        connector: { id: 'none', type: '.none', fields: null, name: 'none' },
        title: 'My Case',
        tags: [],
        description: 'my case desc.',
        settings: { syncAlerts: false },
        owner: 'cases',
        severity: 'low',
        assignees: [],
        status: 'open',
        category: null,
        customFields: [],
      },
      created_at: '2025-01-07T13:31:55.427Z',
      created_by: {
        username: 'elastic',
        full_name: null,
        email: null,
        profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      owner: 'cases',
      action: 'create',
      comment_id: null,
      id: 'e11e39f5-ea29-4cbc-981b-1508cafdb0ad',
      version: 'WzIsMV0=',
    },
    {
      payload: { comment: { comment: 'First comment', type: 'user', owner: 'cases' } },
      type: 'comment',
      created_at: '2025-01-07T13:32:01.314Z',
      created_by: {
        username: 'elastic',
        full_name: null,
        email: null,
        profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      owner: 'cases',
      action: 'create',
      comment_id: '601a03cf-71a0-4949-9407-97cf372b313b',
      id: '71f67236-f2f5-4cfe-964d-a4103a9717f2',
      version: 'WzUsMV0=',
    },
    {
      payload: { comment: { comment: 'Second comment', type: 'user', owner: 'cases' } },
      type: 'comment',
      created_at: '2025-01-07T13:32:08.045Z',
      created_by: {
        username: 'elastic',
        full_name: null,
        email: null,
        profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      owner: 'cases',
      action: 'create',
      comment_id: '2cd1eb7d-ff8a-4c0e-b904-0beb64ab166a',
      id: '00414cd9-b51a-4b85-a7d3-cb39de4d61db',
      version: 'WzgsMV0=',
    },
    {
      payload: { comment: { comment: 'Edited first comment', type: 'user', owner: 'cases' } },
      type: 'comment',
      created_at: '2025-01-07T13:32:18.160Z',
      created_by: {
        username: 'elastic',
        full_name: null,
        email: null,
        profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      owner: 'cases',
      action: 'update',
      comment_id: '123e4567-e89b-12d3-a456-426614174000',
      id: '675cc9a3-5445-4aaa-ad65-21241f095546',
      version: 'WzExLDFd',
    },
  ],
  page: 1,
  perPage: 10,
  total: 4,
};

const attachmentsMockData = {
  attachments: [
    {
      comment: 'Edited first comment',
      type: 'user',
      owner: 'cases',
      created_at: '2025-01-07T13:32:01.283Z',
      created_by: {
        email: null,
        full_name: null,
        username: 'elastic',
        profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      pushed_at: null,
      pushed_by: null,
      updated_at: '2025-01-07T13:32:18.127Z',
      updated_by: {
        username: 'elastic',
        full_name: null,
        email: null,
        profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      id: '601a03cf-71a0-4949-9407-97cf372b313b',
      version: 'WzksMV0=',
    },
    {
      comment: 'Second comment',
      type: 'user',
      owner: 'cases',
      created_at: '2025-01-07T13:32:08.015Z',
      created_by: {
        email: null,
        full_name: null,
        username: 'elastic',
        profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      pushed_at: null,
      pushed_by: null,
      updated_at: null,
      updated_by: null,
      id: '2cd1eb7d-ff8a-4c0e-b904-0beb64ab166a',
      version: 'WzYsMV0=',
    },
    {
      comment: 'Edited first comment',
      type: 'user',
      owner: 'cases',
      created_at: '2025-01-07T13:32:01.283Z',
      created_by: {
        email: null,
        full_name: null,
        username: 'elastic',
        profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      pushed_at: null,
      pushed_by: null,
      updated_at: '2025-01-07T13:32:18.127Z',
      updated_by: {
        username: 'elastic',
        full_name: null,
        email: null,
        profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      id: '123e4567-e89b-12d3-a456-426614174000',
      version: 'WzksMV0=',
    },
  ],
  errors: [],
};

describe('findUserActionsRoute', () => {
  const response = { ok: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return user actions and latest attachments', async () => {
    const casesClientMock = {
      userActions: {
        find: jest.fn().mockResolvedValue(userActionsMockData),
      },
      attachments: {
        bulkGet: jest.fn().mockResolvedValue(attachmentsMockData),
      },
    };
    const context = { cases: { getCasesClient: jest.fn().mockResolvedValue(casesClientMock) } };
    const request = {
      params: {
        case_id: 'my_fake_case_id',
      },
      query: {},
    };

    // @ts-expect-error: mocking necessary properties for handler logic only, no Kibana platform
    await findUserActionsRoute.handler({ context, request, response });

    expect(casesClientMock.attachments.bulkGet).toHaveBeenCalledWith({
      savedObjectIds: [
        userActionsMockData.userActions[1].comment_id,
        userActionsMockData.userActions[2].comment_id,
        userActionsMockData.userActions[3].comment_id,
      ],
      caseID: 'my_fake_case_id',
      mode: 'unified',
    });
    expect(response.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          latestAttachments: expect.arrayContaining([
            expect.objectContaining({
              comment: 'Edited first comment',
              created_at: '2025-01-07T13:32:01.283Z',
              created_by: {
                email: null,
                full_name: null,
                profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
                username: 'elastic',
              },
              id: '601a03cf-71a0-4949-9407-97cf372b313b',
              owner: 'cases',
              pushed_at: null,
              pushed_by: null,
              type: 'user',
              updated_at: '2025-01-07T13:32:18.127Z',
              updated_by: {
                email: null,
                full_name: null,
                profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
                username: 'elastic',
              },
              version: 'WzksMV0=',
            }),
          ]),
        }),
      })
    );
  });

  it('should return empty attachments when no commentId', async () => {
    const casesClientMock = {
      userActions: {
        // userActionsMockData.userActions[0] must have no commentId
        find: jest.fn().mockResolvedValue({ userActions: [userActionsMockData.userActions[0]] }),
      },
      attachments: {
        bulkGet: jest.fn().mockResolvedValue(attachmentsMockData),
      },
    };
    const context = { cases: { getCasesClient: jest.fn().mockResolvedValue(casesClientMock) } };
    const request = {
      params: {
        case_id: 'my_fake_case_id',
      },
      query: {},
    };

    // @ts-expect-error: Kibana platform types are mocked for testing, only implementing necessary properties for handler logic
    await findUserActionsRoute.handler({ context, request, response });

    expect(response.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          latestAttachments: [],
        }),
      })
    );
  });

  it('should filter repeated comment_ids', async () => {
    userActionsMockData.userActions[1].comment_id = userActionsMockData.userActions[2].comment_id;
    const casesClientMock = {
      userActions: {
        find: jest.fn().mockResolvedValue(userActionsMockData),
      },
      attachments: {
        bulkGet: jest.fn().mockResolvedValue(attachmentsMockData),
      },
    };
    const context = { cases: { getCasesClient: jest.fn().mockResolvedValue(casesClientMock) } };
    const request = {
      params: {
        case_id: 'my_fake_case_id',
      },
      query: {},
    };

    // @ts-expect-error: mocking necessary properties for handler logic only, no Kibana platform
    await findUserActionsRoute.handler({ context, request, response });

    expect(casesClientMock.attachments.bulkGet).toHaveBeenCalledWith({
      savedObjectIds: [
        userActionsMockData.userActions[1].comment_id,
        userActionsMockData.userActions[3].comment_id,
      ],
      caseID: 'my_fake_case_id',
      mode: 'unified',
    });
    expect(response.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          latestAttachments: expect.arrayContaining([
            expect.objectContaining({
              comment: 'Edited first comment',
              created_at: '2025-01-07T13:32:01.283Z',
              created_by: {
                email: null,
                full_name: null,
                profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
                username: 'elastic',
              },
              id: '601a03cf-71a0-4949-9407-97cf372b313b',
              owner: 'cases',
              pushed_at: null,
              pushed_by: null,
              type: 'user',
              updated_at: '2025-01-07T13:32:18.127Z',
              updated_by: {
                email: null,
                full_name: null,
                profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
                username: 'elastic',
              },
              version: 'WzksMV0=',
            }),
          ]),
        }),
      })
    );
  });
});
