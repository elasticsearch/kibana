/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MAX_DOCS_PER_PAGE, MAX_USER_ACTIONS_PER_PAGE } from '../../../common/constants';
import { createMockClient } from '../metrics/test_utils/client';
import { createCasesClientMockArgs } from '../mocks';
import { find } from './find';

describe('findUserActions', () => {
  const client = createMockClient();
  const clientArgs = createCasesClientMockArgs();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('errors', () => {
    it('throws with excess fields', async () => {
      await expect(
        // @ts-expect-error: excess attribute
        find({ caseId: 'test-case', params: { foo: 'bar' } }, client, clientArgs)
      ).rejects.toThrow('invalid keys "foo"');
    });

    it(`throws when trying to fetch more than ${MAX_DOCS_PER_PAGE} items`, async () => {
      await expect(
        find({ caseId: 'test-case', params: { page: 209, perPage: 100 } }, client, clientArgs)
      ).rejects.toThrow(
        `Error: The number of documents is too high. Paginating through more than ${MAX_DOCS_PER_PAGE} documents is not possible.`
      );
    });

    it(`throws when perPage > ${MAX_USER_ACTIONS_PER_PAGE}`, async () => {
      await expect(
        find(
          {
            caseId: 'test-case',
            params: {
              page: 1,
              perPage: MAX_USER_ACTIONS_PER_PAGE + 1,
            },
          },
          client,
          clientArgs
        )
      ).rejects.toThrow(
        `Error: The provided perPage value is too high. The maximum allowed perPage value is ${MAX_USER_ACTIONS_PER_PAGE}.`
      );
    });
  });

  describe('search', () => {
    const createMockUserActionSO = (overrides: Record<string, unknown> = {}) => ({
      id: 'ua-1',
      version: 'abc',
      attributes: {
        action: 'create',
        created_at: '2024-01-01T00:00:00Z',
        created_by: { username: 'testuser', full_name: 'Test User', email: 'test@test.com' },
        type: 'comment',
        payload: { comment: { type: 'user', comment: 'Hello world', owner: 'securitySolution' } },
        owner: 'securitySolution',
        comment_id: 'comment-1',
        ...overrides,
      },
      references: [],
    });

    beforeEach(() => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO(),
        createMockUserActionSO({
          payload: {
            comment: { type: 'user', comment: 'Goodbye world', owner: 'securitySolution' },
          },
          created_by: { username: 'otheruser', full_name: 'Other User', email: 'other@test.com' },
        }),
        createMockUserActionSO({
          payload: { title: 'Important case title' },
          type: 'title',
        }),
      ]);
    });

    it('uses findAll when search param is provided', async () => {
      await find({ caseId: 'test-case', params: { search: 'Hello' } }, client, clientArgs);

      expect(clientArgs.services.userActionService.finder.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: 'test-case' })
      );
      expect(clientArgs.services.userActionService.finder.find).not.toHaveBeenCalled();
    });

    it('fetches undecoded results and only decodes the returned page', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'world', page: 1, perPage: 1 } },
        client,
        clientArgs
      );

      expect(clientArgs.services.userActionService.finder.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ decode: false })
      );
      expect(clientArgs.services.userActionService.finder.decodeUserActions).toHaveBeenCalledTimes(
        1
      );
      // only the single paginated result is decoded, not both matches
      expect(clientArgs.services.userActionService.finder.decodeUserActions).toHaveBeenCalledWith(
        expect.arrayContaining([expect.anything()])
      );
      expect(
        (clientArgs.services.userActionService.finder.decodeUserActions as jest.Mock).mock
          .calls[0][0]
      ).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.userActions).toHaveLength(1);
    });

    it('filters user actions by search term in payload', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'Hello' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].payload).toEqual(
        expect.objectContaining({ comment: expect.objectContaining({ comment: 'Hello world' }) })
      );
    });

    it('matches comment content stored in the unified `data.content` shape', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          payload: {
            comment: {
              type: 'user',
              data: { content: 'Unified schema comment' },
              owner: 'securitySolution',
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'unified schema' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('search is case-insensitive', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'hello' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('filters user actions by search term matching author username', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'otheruser' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].created_by.username).toBe('otheruser');
    });

    it('filters user actions by search term matching author full_name', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'Other User' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].created_by.full_name).toBe('Other User');
    });

    it('returns all results when search matches multiple', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'world' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(2);
    });

    it('returns empty results when search matches nothing', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'nonexistent' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(0);
      expect(result.userActions).toEqual([]);
    });

    it('paginates filtered results correctly', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'world', page: 1, perPage: 1 } },
        client,
        clientArgs
      );

      expect(result.total).toBe(2);
      expect(result.userActions).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(1);
    });

    it('returns second page of paginated results', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'world', page: 2, perPage: 1 } },
        client,
        clientArgs
      );

      expect(result.total).toBe(2);
      expect(result.userActions).toHaveLength(1);
      expect(result.page).toBe(2);
    });

    it('uses standard find when search is not provided', async () => {
      clientArgs.services.userActionService.finder.find = jest.fn().mockResolvedValue({
        saved_objects: [createMockUserActionSO()],
        page: 1,
        per_page: 20,
        total: 1,
      });

      await find({ caseId: 'test-case', params: {} }, client, clientArgs);

      expect(clientArgs.services.userActionService.finder.find).toHaveBeenCalled();
      expect(clientArgs.services.userActionService.finder.findAll).not.toHaveBeenCalled();
    });

    it('does not match JSON keys in payload, only values', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'type' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(0);
    });

    it('does not match internal enum values in payload', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'securitySolution' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(0);
    });

    it('handles user actions with null created_by fields', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          created_by: { username: null, full_name: null, email: null },
          payload: {
            comment: { type: 'user', comment: 'test comment', owner: 'securitySolution' },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'test comment' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('does not match null created_by fields against search term', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          created_by: { username: null, full_name: null, email: null },
          payload: { title: 'some title' },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'null' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(0);
    });

    it('matches text custom field values', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'customFields',
          payload: {
            customFields: [
              { key: 'field_1', type: 'text', value: 'root cause analysis' },
              { key: 'field_2', type: 'toggle', value: true },
            ],
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'root cause' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('does not match toggle or number custom field values', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'customFields',
          payload: {
            customFields: [
              { key: 'field_1', type: 'toggle', value: true },
              { key: 'field_2', type: 'number', value: 42 },
            ],
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'true' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(0);
    });

    it('matches extended field values', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'extended_fields',
          payload: {
            extended_fields: {
              summary: 'incident summary text',
              priority: 'high',
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'incident summary' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].payload).toEqual({
        extended_fields: { summary: 'incident summary text' },
      });
    });

    it('projects only matching fields from a multi-field extended_fields update', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'extended_fields',
          payload: {
            extended_fields: {
              my_field: 'xyzaua',
              label: 'option_1',
              escalation: 'true',
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'xyzaua' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].payload).toEqual({
        extended_fields: { my_field: 'xyzaua' },
      });
    });

    it('keeps every matching field when several values contain the term', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'extended_fields',
          payload: {
            extended_fields: {
              summary: 'outage root cause',
              notes: 'root cause analysis',
              priority: 'high',
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'root cause' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].payload).toEqual({
        extended_fields: {
          summary: 'outage root cause',
          notes: 'root cause analysis',
        },
      });
    });

    it('keeps the full extended_fields map when search matches the author', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'extended_fields',
          created_by: {
            username: 'otheruser',
            full_name: 'Other User',
            email: 'other@test.com',
          },
          payload: {
            extended_fields: {
              my_field: 'xyzaua',
              label: 'option_1',
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'otheruser' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].payload).toEqual({
        extended_fields: {
          my_field: 'xyzaua',
          label: 'option_1',
        },
      });
    });

    it('projects extended_fields case-insensitively', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'extended_fields',
          payload: {
            extended_fields: {
              summary: 'Incident Summary',
              priority: 'high',
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'incident summary' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].payload).toEqual({
        extended_fields: { summary: 'Incident Summary' },
      });
    });

    it('does not keep a field whose key looks like the search term', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'extended_fields',
          payload: {
            extended_fields: {
              xyzaua_as_keyword: 'unrelated value',
              other_as_keyword: 'xyzaua',
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'xyzaua' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].payload).toEqual({
        extended_fields: { other_as_keyword: 'xyzaua' },
      });
    });

    it('omits non-string extended_fields values from a value-hit projection', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'extended_fields',
          payload: {
            extended_fields: {
              summary: 'match me',
              nested: { ignored: 'match me' },
              count: 42,
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'match me' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].payload).toEqual({
        extended_fields: { summary: 'match me' },
      });
    });

    it('does not project comment or title payloads', async () => {
      const result = await find(
        { caseId: 'test-case', params: { search: 'Hello' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
      expect(result.userActions[0].payload).toEqual({
        comment: { type: 'user', comment: 'Hello world', owner: 'securitySolution' },
      });
    });

    it('does not project extended_fields when search is not provided', async () => {
      const fullPayload = {
        extended_fields: {
          my_field: 'xyzaua',
          label: 'option_1',
        },
      };
      clientArgs.services.userActionService.finder.find = jest.fn().mockResolvedValue({
        saved_objects: [
          createMockUserActionSO({
            type: 'extended_fields',
            payload: fullPayload,
          }),
        ],
        page: 1,
        per_page: 20,
        total: 1,
      });

      const result = await find({ caseId: 'test-case', params: {} }, client, clientArgs);

      expect(result.userActions[0].payload).toEqual(fullPayload);
      expect(clientArgs.services.userActionService.finder.findAll).not.toHaveBeenCalled();
    });

    it('matches custom field values in create_case payload', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'create_case',
          payload: {
            title: 'New case',
            description: 'A description',
            tags: [],
            status: 'open',
            severity: 'low',
            owner: 'securitySolution',
            assignees: [],
            connector: { id: 'none', name: 'none', type: '.none', fields: null },
            settings: { syncAlerts: false },
            customFields: [{ key: 'field_1', type: 'text', value: 'deployment failure' }],
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'deployment failure' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('matches severity user action values', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'severity',
          payload: { severity: 'critical' },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'critical' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('matches severity values in create_case payload', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'create_case',
          payload: {
            title: 'New case',
            description: 'A description',
            tags: [],
            status: 'open',
            severity: 'critical',
            owner: 'securitySolution',
            assignees: [],
            connector: { id: 'none', name: 'none', type: '.none', fields: null },
            settings: { syncAlerts: false },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'critical' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('matches file names on unified file attachments', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          payload: {
            comment: {
              type: 'file',
              owner: 'securitySolution',
              attachmentId: 'attachment-1',
              metadata: {
                files: [
                  {
                    name: 'screenshot-error.png',
                    extension: 'png',
                    mimeType: 'image/png',
                    created: '2024-01-01T00:00:00Z',
                  },
                ],
              },
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'screenshot-error' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('matches file names on legacy externalReference file attachments', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          payload: {
            comment: {
              type: 'externalReference',
              owner: 'securitySolution',
              externalReferenceAttachmentTypeId: '.files',
              externalReferenceId: 'file-1',
              externalReferenceStorage: { type: 'savedObject', soType: 'file' },
              externalReferenceMetadata: {
                files: [
                  {
                    name: 'legacy-attachment.pdf',
                    extension: 'pdf',
                    mimeType: 'application/pdf',
                    created: '2024-01-01T00:00:00Z',
                  },
                ],
              },
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'legacy-attachment' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('matches any file name when a legacy attachment holds multiple files', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          payload: {
            comment: {
              type: 'externalReference',
              owner: 'securitySolution',
              externalReferenceAttachmentTypeId: '.files',
              externalReferenceId: 'file-1',
              externalReferenceStorage: { type: 'savedObject', soType: 'file' },
              externalReferenceMetadata: {
                files: [
                  {
                    name: 'first-file.txt',
                    extension: 'txt',
                    mimeType: 'text/plain',
                    created: '2024-01-01T00:00:00Z',
                  },
                  {
                    name: 'second-file.csv',
                    extension: 'csv',
                    mimeType: 'text/csv',
                    created: '2024-01-01T00:00:00Z',
                  },
                ],
              },
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'second-file' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('does not throw when a file entry is missing a name', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          payload: {
            comment: {
              type: 'file',
              owner: 'securitySolution',
              attachmentId: 'attachment-1',
              metadata: {
                files: [{ extension: 'png', mimeType: 'image/png', created: '2024-01-01' }],
              },
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'anything' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(0);
    });

    it('does not throw when file metadata is missing or malformed', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          payload: {
            comment: {
              type: 'file',
              owner: 'securitySolution',
              attachmentId: 'attachment-1',
              metadata: { files: null },
            },
          },
        }),
        createMockUserActionSO({
          payload: {
            comment: {
              type: 'file',
              owner: 'securitySolution',
              attachmentId: 'attachment-2',
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'anything' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(0);
    });

    it('does not match unrelated file names', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          payload: {
            comment: {
              type: 'file',
              owner: 'securitySolution',
              attachmentId: 'attachment-1',
              metadata: {
                files: [
                  {
                    name: 'screenshot-error.png',
                    extension: 'png',
                    mimeType: 'image/png',
                    created: '2024-01-01T00:00:00Z',
                  },
                ],
              },
            },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'nonexistent-file' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(0);
    });

    it('matches assignee profile uids', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'assignees',
          payload: { assignees: [{ uid: 'assignee-profile-uid' }] },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'assignee-profile-uid' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    // ── workflow user-action search (finding 4) ───────────────────────────────

    it('matches workflow user action by workflow name', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'workflow',
          payload: {
            workflow: { id: 'wf-1', name: 'Enrich IPs', executionId: 'exec-1' },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: 'Enrich IPs' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('matches workflow user action by observable value for observable origin', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'workflow',
          payload: {
            workflow: { id: 'wf-1', name: 'My Workflow', executionId: 'exec-1' },
            origin: { type: 'cases.observable', id: 'obs-1', value: '192.168.1.1' },
          },
        }),
      ]);

      const result = await find(
        { caseId: 'test-case', params: { search: '192.168.1.1' } },
        client,
        clientArgs
      );

      expect(result.total).toBe(1);
    });

    it('does not match workflow user action by workflow id or executionId', async () => {
      clientArgs.services.userActionService.finder.findAll = jest.fn().mockResolvedValue([
        createMockUserActionSO({
          type: 'workflow',
          payload: {
            workflow: { id: 'wf-opaque-id', name: 'My Workflow', executionId: 'exec-opaque-id' },
          },
        }),
      ]);

      const resultById = await find(
        { caseId: 'test-case', params: { search: 'wf-opaque-id' } },
        client,
        clientArgs
      );
      expect(resultById.total).toBe(0);

      const resultByExecId = await find(
        { caseId: 'test-case', params: { search: 'exec-opaque-id' } },
        client,
        clientArgs
      );
      expect(resultByExecId.total).toBe(0);
    });
  });

  describe('author filter', () => {
    beforeEach(() => {
      clientArgs.services.userActionService.finder.find = jest.fn().mockResolvedValue({
        saved_objects: [],
        page: 1,
        per_page: 20,
        total: 0,
      });
    });

    it('passes authors to the finder service', async () => {
      await find({ caseId: 'test-case', params: { authors: ['testuser'] } }, client, clientArgs);

      expect(clientArgs.services.userActionService.finder.find).toHaveBeenCalledWith(
        expect.objectContaining({ authors: ['testuser'] })
      );
    });

    it('passes multiple authors to the finder service', async () => {
      await find(
        { caseId: 'test-case', params: { authors: ['testuser', 'otheruser'] } },
        client,
        clientArgs
      );

      expect(clientArgs.services.userActionService.finder.find).toHaveBeenCalledWith(
        expect.objectContaining({ authors: ['testuser', 'otheruser'] })
      );
    });
  });
});
