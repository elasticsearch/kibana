/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsFindResult } from '@kbn/core/server';
import type { AttachmentAttributes } from '../../../common/types/domain';
import { CustomFieldTypes, CaseStatuses, CaseSeverity } from '../../../common/types/domain';
import { stringify as yamlStringify } from 'yaml';
import {
  MAX_CATEGORY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TAGS_PER_CASE,
  MAX_LENGTH_PER_TAG,
  MAX_TITLE_LENGTH,
  MAX_CASES_TO_UPDATE,
  MAX_USER_ACTIONS_PER_CASE,
  MAX_ASSIGNEES_PER_CASE,
  MAX_CUSTOM_FIELDS_PER_CASE,
  CASE_ATTACHMENT_SAVED_OBJECT,
} from '../../../common/constants';
import { SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER } from '../../../common/constants/owners';
import { usageCollectionPluginMock } from '@kbn/usage-collection-plugin/server/mocks';
import type { CaseSavedObjectTransformed } from '../../common/types/case';
import {
  SECURITY_ATTACK_ATTACHMENT_TYPE,
  SECURITY_ENTITY_ATTACHMENT_TYPE,
} from '../../../common/constants/attachments';
import { mockCaseComments, mockCases } from '../../mocks';
import { createCasesClientMock, createCasesClientMockArgs } from '../mocks';
import { Operations } from '../../authorization';
import { bulkUpdate, getOperationsToAuthorize } from './bulk_update';

describe('update', () => {
  const cases = {
    cases: [
      {
        id: mockCases[0].id,
        version: mockCases[0].version ?? '',
        assignees: [{ uid: '1' }],
      },
    ],
  };

  const casesClientMock = createCasesClientMock();
  casesClientMock.configure.get = jest.fn().mockResolvedValue([]);

  describe('assignee identity population', () => {
    const clientArgs = createCasesClientMockArgs();

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.config = { ...clientArgs.config, assigneeIdentity: { enabled: true } };
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0], attributes: { assignees: cases.cases[0].assignees } }],
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
      clientArgs.services.userActionService.getMultipleCasesUserActionsTotal.mockResolvedValue({
        [mockCases[0].id]: 0,
        [mockCases[1].id]: 0,
      });
    });

    it('populates assignee identity on the patch payload when enabled', async () => {
      clientArgs.securityStartPlugin.userProfiles.bulkGet.mockResolvedValue([
        {
          uid: '1',
          enabled: true,
          data: {},
          user: { username: 'u1', full_name: 'User One', email: 'u1@e.com' },
        },
      ] as never);

      await bulkUpdate(cases, clientArgs, casesClientMock);

      expect(clientArgs.securityStartPlugin.userProfiles.bulkGet).toHaveBeenCalledTimes(1);
      const patchArgs = clientArgs.services.caseService.patchCases.mock.calls[0][0];
      expect(patchArgs.cases[0].updatedAttributes.assignees).toEqual([
        { uid: '1', username: 'u1', full_name: 'User One', email: 'u1@e.com' },
      ]);
    });

    it('does not resolve profiles when the flag is disabled', async () => {
      clientArgs.config = { ...clientArgs.config, assigneeIdentity: { enabled: false } };

      await bulkUpdate(cases, clientArgs, casesClientMock);

      expect(clientArgs.securityStartPlugin.userProfiles.bulkGet).not.toHaveBeenCalled();
      const patchArgs = clientArgs.services.caseService.patchCases.mock.calls[0][0];
      expect(patchArgs.cases[0].updatedAttributes.assignees).toEqual([{ uid: '1' }]);
    });

    it('notifies only newly added assignees, not retained legacy uid-only ones', async () => {
      // Pre-rollout case: the retained assignee is stored uid-only, so enrichment must not make it
      // look newly added (notification selection compares by uid, not object identity).
      clientArgs.services.caseService.getCases.mockResolvedValue({
        saved_objects: [
          {
            ...mockCases[0],
            attributes: { ...mockCases[0].attributes, assignees: [{ uid: 'legacy' }] },
          },
        ],
      });
      clientArgs.securityStartPlugin.userProfiles.bulkGet.mockResolvedValue([
        {
          uid: 'legacy',
          enabled: true,
          data: {},
          user: { username: 'leg', full_name: 'Legacy', email: 'l@e.com' },
        },
        {
          uid: '1',
          enabled: true,
          data: {},
          user: { username: 'u1', full_name: 'User One', email: 'u1@e.com' },
        },
      ] as never);
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [
          {
            ...mockCases[0],
            attributes: {
              assignees: [
                { uid: 'legacy', username: 'leg', full_name: 'Legacy', email: 'l@e.com' },
                { uid: '1', username: 'u1', full_name: 'User One', email: 'u1@e.com' },
              ],
            },
          },
        ],
      });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              assignees: [{ uid: 'legacy' }, { uid: '1' }],
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.notificationService.bulkNotifyAssignees).toHaveBeenCalledTimes(1);
      const notified = clientArgs.services.notificationService.bulkNotifyAssignees.mock.calls[0][0];
      expect(notified[0].assignees).toEqual([
        { uid: '1', username: 'u1', full_name: 'User One', email: 'u1@e.com' },
      ]);
    });
  });

  describe('Assignees', () => {
    const clientArgs = createCasesClientMockArgs();

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });

      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0], attributes: { assignees: cases.cases[0].assignees } }],
      });

      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
      clientArgs.services.userActionService.getMultipleCasesUserActionsTotal.mockResolvedValue({
        [mockCases[0].id]: 0,
        [mockCases[1].id]: 0,
      });
    });

    it('notifies an assignee', async () => {
      await bulkUpdate(cases, clientArgs, casesClientMock);

      expect(clientArgs.services.notificationService.bulkNotifyAssignees).toHaveBeenCalledWith([
        {
          assignees: [{ uid: '1' }],
          theCase: {
            ...mockCases[0],
            attributes: { ...mockCases[0].attributes, assignees: [{ uid: '1' }] },
          },
        },
      ]);
    });

    it('emits caseUpdated events for updated cases', async () => {
      await bulkUpdate(cases, clientArgs, casesClientMock);

      expect(clientArgs.casesEventBus.emitCaseUpdated).toHaveBeenCalledTimes(1);
      expect(clientArgs.casesEventBus.emitCaseUpdated).toHaveBeenCalledWith(
        clientArgs.request,
        {
          caseId: mockCases[0].id,
          owner: mockCases[0].attributes.owner,
          updatedFields: ['assignees'],
        },
        expect.anything()
      );
    });

    it('emits caseUpdated events with only fields that actually changed', async () => {
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0], attributes: { status: CaseStatuses.closed } }],
      });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              title: mockCases[0].attributes.title, // unchanged — must not appear in updatedFields
              status: CaseStatuses.closed, // actually changed
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.casesEventBus.emitCaseUpdated).toHaveBeenCalledTimes(1);
      expect(clientArgs.casesEventBus.emitCaseUpdated).toHaveBeenCalledWith(
        clientArgs.request,
        {
          caseId: mockCases[0].id,
          owner: mockCases[0].attributes.owner,
          updatedFields: ['status'],
        },
        expect.anything()
      );
    });

    it('does not notify if the case does not exist', async () => {
      expect.assertions(2);

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: 'not-exists',
                version: '123',
                assignees: [{ uid: '1' }],
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"not-exists","version":"123"}]: Error: These cases not-exists do not exist. Please check you have the correct ids.'
      );

      expect(clientArgs.services.notificationService.bulkNotifyAssignees).not.toHaveBeenCalled();
    });

    it('does not notify if the case is patched with the same assignee', async () => {
      expect.assertions(2);

      clientArgs.services.caseService.getCases.mockResolvedValue({
        saved_objects: [
          {
            ...mockCases[0],
            attributes: { ...mockCases[0].attributes, assignees: [{ uid: '1' }] },
          },
        ],
      });

      await expect(bulkUpdate(cases, clientArgs, casesClientMock)).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: All update fields are identical to current version.'
      );

      expect(clientArgs.services.notificationService.bulkNotifyAssignees).not.toHaveBeenCalled();
    });

    it('notifies only new users', async () => {
      clientArgs.services.caseService.getCases.mockResolvedValue({
        saved_objects: [
          {
            ...mockCases[0],
            attributes: { ...mockCases[0].attributes, assignees: [{ uid: '1' }] },
          },
        ],
      });

      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [
          {
            ...mockCases[0],
            attributes: { assignees: [{ uid: '1' }, { uid: '2' }, { uid: '3' }] },
          },
        ],
      });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              assignees: [{ uid: '1' }, { uid: '2' }, { uid: '3' }],
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.notificationService.bulkNotifyAssignees).toHaveBeenCalledWith([
        {
          assignees: [{ uid: '2' }, { uid: '3' }],
          theCase: {
            ...mockCases[0],
            attributes: {
              ...mockCases[0].attributes,
              assignees: [{ uid: '1' }, { uid: '2' }, { uid: '3' }],
            },
          },
        },
      ]);
    });

    it('does not notify when removing assignees', async () => {
      clientArgs.services.caseService.getCases.mockResolvedValue({
        saved_objects: [
          {
            ...mockCases[0],
            attributes: { ...mockCases[0].attributes, assignees: [{ uid: '1' }, { uid: '2' }] },
          },
        ],
      });

      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0], attributes: { assignees: [{ uid: '1' }] } }],
      });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              assignees: [{ uid: '1' }],
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.notificationService.bulkNotifyAssignees).toHaveBeenCalledWith([]);
      expect(clientArgs.services.notificationService.notifyAssignees).not.toHaveBeenCalled();
    });

    it('does not notify the current user', async () => {
      clientArgs.services.caseService.getCases.mockResolvedValue({
        saved_objects: [
          {
            ...mockCases[0],
            attributes: { ...mockCases[0].attributes, assignees: [{ uid: '1' }] },
          },
        ],
      });

      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [
          {
            ...mockCases[0],
            attributes: {
              assignees: [{ uid: '2' }, { uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0' }],
            },
          },
        ],
      });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              assignees: [{ uid: '2' }, { uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0' }],
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.notificationService.bulkNotifyAssignees).toHaveBeenCalledWith([
        {
          assignees: [{ uid: '2' }],
          theCase: {
            ...mockCases[0],
            attributes: {
              ...mockCases[0].attributes,
              assignees: [{ uid: '2' }, { uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0' }],
            },
          },
        },
      ]);
    });

    it('does not notify when there are no new assignees', async () => {
      clientArgs.services.caseService.getCases.mockResolvedValue({
        saved_objects: [
          {
            ...mockCases[0],
            attributes: { ...mockCases[0].attributes, assignees: [{ uid: '1' }] },
          },
        ],
      });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              assignees: [{ uid: '1' }, { uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0' }],
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      /**
       * Current user is filtered out. Assignee with uid=1 should not be
       * notified because it was already assigned to the case.
       */
      expect(clientArgs.services.notificationService.bulkNotifyAssignees).toHaveBeenCalledWith([]);
      expect(clientArgs.services.notificationService.notifyAssignees).not.toHaveBeenCalled();
    });

    it('should throw an error when an invalid field is included in the request payload', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                assignees: [{ uid: '1' }],
                // @ts-expect-error invalid field
                foo: 'bar',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to update case, ids: [{\\"id\\":\\"mock-id-1\\",\\"version\\":\\"WzAsMV0=\\"}]: Error: invalid keys \\"foo\\""`
      );
    });

    it('should throw an error if the assignees array length is too long', async () => {
      const assignees = Array(MAX_ASSIGNEES_PER_CASE + 1).fill({ uid: 'foo' });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                assignees,
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The length of the field assignees is too long. Array must be of length <= 10.'
      );
    });

    it('returns only updateCase operation when no reopened cases or changed assignees', () => {
      const operations = getOperationsToAuthorize({
        reopenedCases: [],
        changedAssignees: [],
        allCases: cases.cases,
      });
      expect(operations).toEqual([Operations.updateCase]);
    });

    it('returns only assignCase operation when all cases are assignee-only changes', () => {
      const assignOnlyCases = [
        { id: mockCases[0].id, version: mockCases[0].version ?? '', assignees: [{ uid: '1' }] },
      ];
      const operations = getOperationsToAuthorize({
        reopenedCases: [],
        changedAssignees: assignOnlyCases,
        allCases: assignOnlyCases,
      });
      expect(operations).toEqual([Operations.assignCase]);
    });

    it('returns assignCase and updateCase when an assignee-change request includes an injected title field', () => {
      const assignWithTitle = [
        {
          id: mockCases[0].id,
          version: mockCases[0].version ?? '',
          assignees: [{ uid: '1' }],
          title: 'injected',
        },
      ];
      const operations = getOperationsToAuthorize({
        reopenedCases: [],
        changedAssignees: assignWithTitle,
        allCases: assignWithTitle,
      });
      expect(operations).toEqual([Operations.assignCase, Operations.updateCase]);
    });

    it('returns only reopenCase operation when all cases are being reopened with only status', () => {
      const statusOnlyCases = [
        { id: mockCases[0].id, version: mockCases[0].version ?? '', status: CaseStatuses.open },
      ];
      const operations = getOperationsToAuthorize({
        reopenedCases: statusOnlyCases,
        changedAssignees: [],
        allCases: statusOnlyCases,
      });
      expect(operations).toEqual([Operations.reopenCase]);
    });

    it('returns reopenCase and updateCase when a reopened case includes assignees', () => {
      const reopenWithAssignees = [
        {
          id: mockCases[0].id,
          version: mockCases[0].version ?? '',
          status: CaseStatuses.open,
          assignees: [{ uid: '1' }],
        },
      ];
      const operations = getOperationsToAuthorize({
        reopenedCases: reopenWithAssignees,
        changedAssignees: [],
        allCases: reopenWithAssignees,
      });
      expect(operations).toEqual([Operations.reopenCase, Operations.updateCase]);
    });

    it('returns assignCase and updateCase when some cases have non-assignee changes', () => {
      const case2 = { id: 'case-2', version: '1' };
      const operations = getOperationsToAuthorize({
        reopenedCases: [],
        changedAssignees: cases.cases,
        allCases: [...cases.cases, case2],
      });
      expect(operations).toEqual([Operations.assignCase, Operations.updateCase]);
    });

    it('returns reopenCase and updateCase when some cases have non-reopen changes', () => {
      const case2 = { id: 'case-2', version: '1' };
      const operations = getOperationsToAuthorize({
        reopenedCases: cases.cases,
        changedAssignees: [],
        allCases: [...cases.cases, case2],
      });
      expect(operations).toEqual([Operations.reopenCase, Operations.updateCase]);
    });

    it('returns all operations when cases have mixed changes', () => {
      const case2 = { id: 'case-2', version: '1' };
      const case3 = { id: 'case-3', version: '1' };
      const operations = getOperationsToAuthorize({
        reopenedCases: cases.cases,
        changedAssignees: [case2],
        allCases: [...cases.cases, case2, case3],
      });
      expect(operations).toEqual([
        Operations.reopenCase,
        Operations.assignCase,
        Operations.updateCase,
      ]);
    });

    it('handles empty casesToAuthorize array', () => {
      const operations = getOperationsToAuthorize({
        reopenedCases: [],
        changedAssignees: [],
        allCases: [],
      });
      expect(operations).toEqual([]);
    });

    it('returns only combined operations when all cases have both reopen and assignee changes', () => {
      const operations = getOperationsToAuthorize({
        reopenedCases: cases.cases,
        changedAssignees: cases.cases,
        allCases: cases.cases,
      });
      expect(operations).toEqual([
        Operations.reopenCase,
        Operations.assignCase,
        Operations.updateCase,
      ]);
    });

    it('returns reopenCase and updateCase when a reopened case has an injected title field', () => {
      const reopenWithTitle = [
        {
          id: mockCases[0].id,
          version: mockCases[0].version ?? '',
          status: CaseStatuses.open,
          title: 'injected',
        },
      ];
      const operations = getOperationsToAuthorize({
        reopenedCases: reopenWithTitle,
        changedAssignees: [],
        allCases: reopenWithTitle,
      });
      expect(operations).toEqual([Operations.reopenCase, Operations.updateCase]);
    });

    it('returns reopenCase and updateCase when a reopened case has an injected description field', () => {
      const reopenWithDescription = [
        {
          id: mockCases[0].id,
          version: mockCases[0].version ?? '',
          status: CaseStatuses.open,
          description: 'injected',
        },
      ];
      const operations = getOperationsToAuthorize({
        reopenedCases: reopenWithDescription,
        changedAssignees: [],
        allCases: reopenWithDescription,
      });
      expect(operations).toEqual([Operations.reopenCase, Operations.updateCase]);
    });

    it('returns reopenCase and updateCase when a reopened case has an injected severity field', () => {
      const reopenWithSeverity = [
        {
          id: mockCases[0].id,
          version: mockCases[0].version ?? '',
          status: CaseStatuses.open,
          severity: CaseSeverity.CRITICAL,
        },
      ];
      const operations = getOperationsToAuthorize({
        reopenedCases: reopenWithSeverity,
        changedAssignees: [],
        allCases: reopenWithSeverity,
      });
      expect(operations).toEqual([Operations.reopenCase, Operations.updateCase]);
    });

    it('should filter out empty user profiles', async () => {
      const casesWithEmptyAssignee = {
        cases: [
          {
            ...cases.cases[0],
            assignees: [{ uid: '' }, { uid: '2' }],
          },
        ],
      };
      await bulkUpdate(casesWithEmptyAssignee, clientArgs, casesClientMock);
      expect(clientArgs.services.caseService.patchCases).toHaveBeenCalledWith(
        expect.objectContaining({
          cases: expect.arrayContaining([
            expect.objectContaining({
              updatedAttributes: expect.objectContaining({
                assignees: [{ uid: '2' }],
              }),
            }),
          ]),
        })
      );
    });
  });

  describe('Category', () => {
    const clientArgs = createCasesClientMockArgs();

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
    });

    it(`does not throw error when category is non empty string less than ${MAX_CATEGORY_LENGTH} characters`, async () => {
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                category: 'foobar',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).resolves.not.toThrow();
    });

    it('does not update the category if the length is too long', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                category: 'A very long category with more than fifty characters!',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        `Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The length of the category is too long. The maximum length is ${MAX_CATEGORY_LENGTH}.,Invalid value \"A very long category with more than fifty characters!\" supplied to \"cases,category\"`
      );
    });

    it('throws error if category is just an empty string', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                category: '',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The category field cannot be an empty string.,Invalid value "" supplied to "cases,category"'
      );
    });

    it('throws error if category is a string with empty characters', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                category: '   ',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The category field cannot be an empty string.,Invalid value "   " supplied to "cases,category"'
      );
    });

    it('should trim category', async () => {
      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              category: 'security     ',
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.caseService.patchCases).toHaveBeenCalledWith(
        expect.objectContaining({
          cases: [
            {
              caseId: mockCases[0].id,
              version: mockCases[0].version,
              originalCase: {
                ...mockCases[0],
              },
              updatedAttributes: {
                category: 'security',
                updated_at: expect.any(String),
                updated_by: expect.any(Object),
              },
            },
          ],
          refresh: false,
        })
      );
    });
  });

  describe('Template', () => {
    const clientArgs = createCasesClientMockArgs();

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }],
      });
    });

    it('resolves the applied template name and passes it to buildUserActions', async () => {
      clientArgs.services.templatesService.getTemplate.mockResolvedValue({
        attributes: { name: 'My Template' },
      } as Awaited<ReturnType<typeof clientArgs.services.templatesService.getTemplate>>);

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.templatesService.getTemplate).toHaveBeenCalledWith('tmpl-1', '3');
      expect(clientArgs.services.userActionService.creator.buildUserActions).toHaveBeenCalledWith(
        expect.objectContaining({
          templateNamesByKey: new Map([['tmpl-1@3', 'My Template']]),
        })
      );
    });

    it('omits the applied template from templateNamesByKey when it cannot be resolved', async () => {
      clientArgs.services.templatesService.getTemplate.mockResolvedValue(undefined);

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: { id: 'tmpl-missing', version: 1 },
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.userActionService.creator.buildUserActions).toHaveBeenCalledWith(
        expect.objectContaining({
          templateNamesByKey: new Map(),
        })
      );
    });
  });

  describe('Template counters', () => {
    const usageCounter = usageCollectionPluginMock
      .createSetupContract()
      .createUsageCounter('cases');
    const caseWithTemplate = {
      ...mockCases[0],
      attributes: { ...mockCases[0].attributes, template: { id: 'tmpl-1', version: 3 } },
    };

    type PatchedCaseResult = Awaited<
      ReturnType<
        ReturnType<typeof createCasesClientMockArgs>['services']['caseService']['patchCases']
      >
    >['saved_objects'][number];

    const setupArgs = ({
      clientSource = 'rest_api',
      originalCases = [mockCases[0]],
      patchedCases,
    }: {
      clientSource?: 'rest_api' | 'connector';
      originalCases?: CaseSavedObjectTransformed[];
      patchedCases?: PatchedCaseResult[];
    } = {}) => {
      const args = { ...createCasesClientMockArgs(), usageCounter, clientSource };

      args.services.caseService.getCases.mockResolvedValue({ saved_objects: originalCases });
      args.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });
      args.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(new Map());
      args.services.caseService.patchCases.mockResolvedValue({
        saved_objects: patchedCases ?? originalCases,
      });
      args.services.templatesService.getTemplate.mockResolvedValue({
        attributes: { name: 'My Template' },
      } as Awaited<ReturnType<typeof args.services.templatesService.getTemplate>>);

      return args;
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('counts a template applied to an existing case', async () => {
      const clientArgs = setupArgs();

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'apply_template',
        counterType: 'cases_client.rest_api',
        incrementBy: 1,
      });
      expect(usageCounter.incrementCounter).toHaveBeenCalledTimes(1);
    });

    it('counts a template cleared from an existing case', async () => {
      const clientArgs = setupArgs({ originalCases: [caseWithTemplate] });

      await bulkUpdate(
        {
          cases: [
            {
              id: caseWithTemplate.id,
              version: caseWithTemplate.version ?? '',
              template: null,
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'clear_template',
        counterType: 'cases_client.rest_api',
        incrementBy: 1,
      });
      expect(usageCounter.incrementCounter).toHaveBeenCalledTimes(1);
    });

    it('does not count clearing a template from a case that never had one', async () => {
      const clientArgs = setupArgs();

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: null,
              title: 'A new title',
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(usageCounter.incrementCounter).not.toHaveBeenCalledWith(
        expect.objectContaining({ counterName: 'clear_template' })
      );
    });

    // The no-op filter drops an unchanged template before the update logic runs, so this counts
    // effective changes rather than what the caller happened to send.
    it('does not count re-sending the template a case already has', async () => {
      const clientArgs = setupArgs({ originalCases: [caseWithTemplate] });

      await bulkUpdate(
        {
          cases: [
            {
              id: caseWithTemplate.id,
              version: caseWithTemplate.version ?? '',
              template: { id: 'tmpl-1', version: 3 },
              title: 'A new title',
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(usageCounter.incrementCounter).not.toHaveBeenCalledWith(
        expect.objectContaining({ counterName: 'apply_template' })
      );
    });

    it('counts cases, not update calls', async () => {
      const secondCase = { ...mockCases[0], id: 'mock-id-2' };
      const clientArgs = setupArgs({ originalCases: [mockCases[0], secondCase] });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
            {
              id: secondCase.id,
              version: secondCase.version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'apply_template',
        counterType: 'cases_client.rest_api',
        incrementBy: 2,
      });
      expect(usageCounter.incrementCounter).toHaveBeenCalledTimes(1);
    });

    it('splits one update across both buckets', async () => {
      const secondCase = { ...caseWithTemplate, id: 'mock-id-2' };
      const clientArgs = setupArgs({ originalCases: [mockCases[0], secondCase] });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
            {
              id: secondCase.id,
              version: secondCase.version ?? '',
              template: null,
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'apply_template',
        counterType: 'cases_client.rest_api',
        incrementBy: 1,
      });
      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'clear_template',
        counterType: 'cases_client.rest_api',
        incrementBy: 1,
      });
      expect(usageCounter.incrementCounter).toHaveBeenCalledTimes(2);
    });

    it('counts a case once when the request repeats its id', async () => {
      const clientArgs = setupArgs();

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'apply_template',
        counterType: 'cases_client.rest_api',
        incrementBy: 1,
      });
    });

    // Matches how the adjacent updatedFieldsByCaseId reducer resolves a repeated id.
    it('keeps the first template change when the request repeats an id with conflicting ones', async () => {
      const clientArgs = setupArgs({ originalCases: [caseWithTemplate] });

      await bulkUpdate(
        {
          cases: [
            {
              id: caseWithTemplate.id,
              version: caseWithTemplate.version ?? '',
              template: null,
            },
            {
              id: caseWithTemplate.id,
              version: caseWithTemplate.version ?? '',
              template: { id: 'tmpl-2', version: 1 },
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'clear_template',
        counterType: 'cases_client.rest_api',
        incrementBy: 1,
      });
      expect(usageCounter.incrementCounter).toHaveBeenCalledTimes(1);
    });

    it('attributes counters to the calling source', async () => {
      const clientArgs = setupArgs({ clientSource: 'connector' });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'apply_template',
        counterType: 'cases_client.connector',
        incrementBy: 1,
      });
      expect(usageCounter.incrementCounter).toHaveBeenCalledTimes(1);
    });

    it('does not count a case whose update failed to persist', async () => {
      const secondCase = { ...mockCases[0], id: 'mock-id-2' };
      const clientArgs = setupArgs({
        originalCases: [mockCases[0], secondCase],
        patchedCases: [
          mockCases[0],
          {
            type: 'cases',
            id: secondCase.id,
            attributes: {},
            error: { error: 'Conflict', message: 'conflict', statusCode: 409 },
          },
        ],
      });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
            {
              id: secondCase.id,
              version: secondCase.version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'apply_template',
        counterType: 'cases_client.rest_api',
        incrementBy: 1,
      });
      expect(usageCounter.incrementCounter).toHaveBeenCalledTimes(1);
    });

    it('adds one use per case to the applied template usage stats', async () => {
      const secondCase = { ...mockCases[0], id: 'mock-id-2' };
      const clientArgs = setupArgs({ originalCases: [mockCases[0], secondCase] });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
            {
              id: secondCase.id,
              version: secondCase.version ?? '',
              template: { id: 'tmpl-1', version: 3 },
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.templatesService.incrementUsageStats).toHaveBeenCalledTimes(1);
      expect(clientArgs.services.templatesService.incrementUsageStats).toHaveBeenCalledWith(
        'tmpl-1',
        2
      );
    });

    it('does not touch usage stats when a template is only cleared', async () => {
      const clientArgs = setupArgs({ originalCases: [caseWithTemplate] });

      await bulkUpdate(
        {
          cases: [
            {
              id: caseWithTemplate.id,
              version: caseWithTemplate.version ?? '',
              template: null,
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.templatesService.incrementUsageStats).not.toHaveBeenCalled();
    });

    it('does not fail the update when the template usage stats write fails', async () => {
      const clientArgs = setupArgs();
      clientArgs.services.templatesService.incrementUsageStats.mockRejectedValueOnce(
        new Error('stats update failed')
      );

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                template: { id: 'tmpl-1', version: 3 },
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).resolves.not.toThrow();

      expect(clientArgs.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update template usage stats')
      );
    });

    it('does not count an update that failed', async () => {
      const clientArgs = setupArgs();
      clientArgs.services.caseService.patchCases.mockRejectedValueOnce(new Error('update failed'));

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                template: { id: 'tmpl-1', version: 3 },
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow();

      expect(usageCounter.incrementCounter).not.toHaveBeenCalled();
    });
  });

  describe('Title', () => {
    const clientArgs = createCasesClientMockArgs();

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
    });

    it(`does not throw error when title is non empty string less than ${MAX_TITLE_LENGTH} characters`, async () => {
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                title: 'This is a test case!!',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).resolves.not.toThrow();
    });

    it('throws error if the title is too long', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                title:
                  'This is a very long title with more than one hundred and sixty characters!! To confirm the maximum limit error thrown for more than one hundred and sixty characters!!',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        `Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The length of the title is too long. The maximum length is ${MAX_TITLE_LENGTH}.`
      );
    });

    it('throws error if title is just an empty string', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                title: '',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The title field cannot be an empty string.'
      );
    });

    it('throws error if title is a string with empty characters', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                title: '   ',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The title field cannot be an empty string.'
      );
    });

    it('should trim title', async () => {
      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              title: 'title with spaces      ',
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.caseService.patchCases).toHaveBeenCalledWith(
        expect.objectContaining({
          cases: [
            {
              caseId: mockCases[0].id,
              version: mockCases[0].version,
              originalCase: {
                ...mockCases[0],
              },
              updatedAttributes: {
                title: 'title with spaces',
                updated_at: expect.any(String),
                updated_by: expect.any(Object),
              },
            },
          ],
          refresh: false,
        })
      );
    });
  });

  describe('Description', () => {
    const clientArgs = createCasesClientMockArgs();

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
    });

    it(`does not throw error when description is non empty string less than ${MAX_DESCRIPTION_LENGTH} characters`, async () => {
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                description: 'New updated description!!',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).resolves.not.toThrow();
    });

    it('throws error when the description is too long', async () => {
      const description = Array(MAX_DESCRIPTION_LENGTH + 1)
        .fill('a')
        .toString();

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                description,
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        `Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The length of the description is too long. The maximum length is ${MAX_DESCRIPTION_LENGTH}.`
      );
    });

    it('throws error if description is just an empty string', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                description: '',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The description field cannot be an empty string.'
      );
    });

    it('throws error if description is a string with empty characters', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                description: '   ',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The description field cannot be an empty string.'
      );
    });

    it('should trim description', async () => {
      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              description: 'This is a description with spaces!!      ',
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.caseService.patchCases).toHaveBeenCalledWith(
        expect.objectContaining({
          cases: [
            {
              caseId: mockCases[0].id,
              version: mockCases[0].version,
              originalCase: {
                ...mockCases[0],
              },
              updatedAttributes: {
                description: 'This is a description with spaces!!',
                updated_at: expect.any(String),
                updated_by: expect.any(Object),
              },
            },
          ],
          refresh: false,
        })
      );
    });
  });

  describe('Total comments and alerts', () => {
    const clientArgs = createCasesClientMockArgs();

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });

      const caseCommentsStats = new Map();
      caseCommentsStats.set(mockCases[0].id, { userComments: 1, alerts: 2, events: 0 });
      caseCommentsStats.set(mockCases[1].id, { userComments: 3, alerts: 4, events: 0 });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        caseCommentsStats
      );
    });

    it('calls the attachment service with the right params and returns the expected comments and alerts', async () => {
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }, { ...mockCases[1] }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                description: 'New updated description!!',
              },
              {
                id: mockCases[1].id,
                version: mockCases[1].version ?? '',
                description: 'New updated description!!',
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).resolves.toMatchInlineSnapshot(`
        Array [
          Object {
            "assignees": Array [],
            "category": null,
            "closed_at": null,
            "closed_by": null,
            "comments": Array [],
            "connector": Object {
              "fields": null,
              "id": "none",
              "name": "none",
              "type": ".none",
            },
            "created_at": "2019-11-25T21:54:48.952Z",
            "created_by": Object {
              "email": "testemail@elastic.co",
              "full_name": "elastic",
              "username": "elastic",
            },
            "customFields": Array [],
            "description": "This is a brand new case of a bad meanie defacing data",
            "duration": null,
            "external_service": null,
            "id": "mock-id-1",
            "incremental_id": undefined,
            "observables": Array [],
            "owner": "securitySolution",
            "settings": Object {
              "extractObservables": true,
              "syncAlerts": true,
            },
            "severity": "low",
            "status": "open",
            "tags": Array [
              "defacement",
            ],
            "title": "Super Bad Security Issue",
            "totalAlerts": 2,
            "totalComment": 1,
            "totalEvents": 0,
            "total_observables": 0,
            "updated_at": "2019-11-25T21:54:48.952Z",
            "updated_by": Object {
              "email": "testemail@elastic.co",
              "full_name": "elastic",
              "username": "elastic",
            },
            "version": "WzAsMV0=",
          },
          Object {
            "assignees": Array [],
            "category": null,
            "closed_at": null,
            "closed_by": null,
            "comments": Array [],
            "connector": Object {
              "fields": null,
              "id": "none",
              "name": "none",
              "type": ".none",
            },
            "created_at": "2019-11-25T22:32:00.900Z",
            "created_by": Object {
              "email": "testemail@elastic.co",
              "full_name": "elastic",
              "username": "elastic",
            },
            "customFields": Array [],
            "description": "Oh no, a bad meanie destroying data!",
            "duration": null,
            "external_service": null,
            "id": "mock-id-2",
            "incremental_id": undefined,
            "observables": Array [],
            "owner": "securitySolution",
            "settings": Object {
              "extractObservables": true,
              "syncAlerts": true,
            },
            "severity": "low",
            "status": "open",
            "tags": Array [
              "Data Destruction",
            ],
            "title": "Damaging Data Destruction Detected",
            "totalAlerts": 4,
            "totalComment": 3,
            "totalEvents": 0,
            "total_observables": 0,
            "updated_at": "2019-11-25T22:32:00.900Z",
            "updated_by": Object {
              "email": "testemail@elastic.co",
              "full_name": "elastic",
              "username": "elastic",
            },
            "version": "WzQsMV0=",
          },
        ]
      `);

      expect(
        clientArgs.services.attachmentService.getter.getCaseAttatchmentStats
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          caseIds: [mockCases[0].id, mockCases[1].id],
        })
      );
    });
  });

  describe('Tags', () => {
    const clientArgs = createCasesClientMockArgs();

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
    });

    it('does not throw error when tags array is empty', async () => {
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                tags: [],
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).resolves.not.toThrow();
    });

    it(`does not throw error when tags array length is less than ${MAX_TAGS_PER_CASE} and tag has ${MAX_LENGTH_PER_TAG} characters`, async () => {
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                tags: ['foo', 'bar'],
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).resolves.not.toThrow();
    });

    it('throws error if the tags array length is too long', async () => {
      const tags = Array(MAX_TAGS_PER_CASE + 1).fill('foo');

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                tags,
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        `Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The length of the field tags is too long. Array must be of length <= ${MAX_TAGS_PER_CASE}.`
      );
    });

    it('throws error if the tag length is too long', async () => {
      const tag = Array(MAX_LENGTH_PER_TAG + 1)
        .fill('f')
        .toString();

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                tags: [tag],
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        `Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The length of the tag is too long. The maximum length is ${MAX_LENGTH_PER_TAG}.`
      );
    });

    it('throws error if tag is empty string', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                tags: [''],
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The tag field cannot be an empty string.'
      );
    });

    it('throws error if tag is a string with empty characters', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                tags: ['   '],
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: The tag field cannot be an empty string.'
      );
    });

    it('should trim tags', async () => {
      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              tags: ['coke      ', 'pepsi'],
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      expect(clientArgs.services.caseService.patchCases).toHaveBeenCalledWith(
        expect.objectContaining({
          cases: [
            {
              caseId: mockCases[0].id,
              version: mockCases[0].version,
              originalCase: {
                ...mockCases[0],
              },
              updatedAttributes: {
                tags: ['coke', 'pepsi'],
                updated_at: expect.any(String),
                updated_by: expect.any(Object),
              },
            },
          ],
          refresh: false,
        })
      );
    });
  });

  describe('Custom Fields', () => {
    const clientArgs = createCasesClientMockArgs();
    const casesClient = createCasesClientMock();
    const defaultCustomFieldsConfiguration = [
      {
        key: 'first_key',
        type: CustomFieldTypes.TEXT,
        label: 'missing field 1',
        required: true,
        defaultValue: 'default value',
      },
      {
        key: 'second_key',
        type: CustomFieldTypes.TOGGLE,
        label: 'foo',
        required: false,
      },
    ];

    beforeEach(() => {
      jest.clearAllMocks();
      // These tests assert the exact custom-field patch payload; the extended_fields
      // mirroring (templates flag ON) is covered by dedicated tests below.
      clientArgs.config = { ...clientArgs.config, templates: { enabled: false } };
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });

      casesClient.configure.get = jest.fn().mockResolvedValue([
        {
          owner: mockCases[0].attributes.owner,
          customFields: defaultCustomFieldsConfiguration,
        },
      ]);
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
    });

    it('can update customFields', async () => {
      const customFields = [
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT as const,
          value: 'this is a text field value',
        },
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE as const,
          value: null,
        },
      ];

      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                customFields,
              },
            ],
          },
          clientArgs,
          casesClient
        )
      ).resolves.not.toThrow();

      expect(clientArgs.services.caseService.patchCases).toHaveBeenCalledWith(
        expect.objectContaining({
          cases: [
            {
              caseId: mockCases[0].id,
              version: mockCases[0].version,
              originalCase: {
                ...mockCases[0],
              },
              updatedAttributes: {
                customFields,
                updated_at: expect.any(String),
                updated_by: expect.any(Object),
              },
            },
          ],
          refresh: false,
        })
      );
    });

    it('fills out missing custom fields', async () => {
      const customFields = [
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT as const,
          value: 'this is a text field value',
        },
      ];

      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                customFields,
              },
            ],
          },
          clientArgs,
          casesClient
        )
      ).resolves.not.toThrow();

      expect(clientArgs.services.caseService.patchCases).toHaveBeenCalledWith(
        expect.objectContaining({
          cases: [
            {
              caseId: mockCases[0].id,
              version: mockCases[0].version,
              originalCase: {
                ...mockCases[0],
              },
              updatedAttributes: {
                customFields: [
                  ...customFields,
                  {
                    key: 'second_key',
                    type: CustomFieldTypes.TOGGLE as const,
                    value: null,
                  },
                ],
                updated_at: expect.any(String),
                updated_by: expect.any(Object),
              },
            },
          ],
          refresh: false,
        })
      );
    });

    it('fills out missing required custom fields', async () => {
      const customFields = [
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE as const,
          value: false,
        },
      ];

      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                customFields,
              },
            ],
          },
          clientArgs,
          casesClient
        )
      ).resolves.not.toThrow();

      expect(clientArgs.services.caseService.patchCases).toHaveBeenCalledWith(
        expect.objectContaining({
          cases: [
            {
              caseId: mockCases[0].id,
              version: mockCases[0].version,
              originalCase: {
                ...mockCases[0],
              },
              updatedAttributes: {
                customFields: [
                  ...customFields,
                  {
                    key: 'first_key',
                    type: CustomFieldTypes.TEXT as const,
                    value: 'default value',
                  },
                ],
                updated_at: expect.any(String),
                updated_by: expect.any(Object),
              },
            },
          ],
          refresh: false,
        })
      );
    });

    it('throws error when the customFields array is too long', async () => {
      const customFields = Array(MAX_CUSTOM_FIELDS_PER_CASE + 1).fill({
        key: 'first_custom_field_key',
        type: 'text',
        value: 'this is a text field value',
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                customFields,
              },
            ],
          },
          clientArgs,
          casesClient
        )
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to update case, ids: [{\\"id\\":\\"mock-id-1\\",\\"version\\":\\"WzAsMV0=\\"}]: Error: The length of the field customFields is too long. Array must be of length <= 10."`
      );
    });

    it('throws with duplicated customFields keys', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                customFields: [
                  {
                    key: 'duplicated_key',
                    type: CustomFieldTypes.TEXT,
                    value: 'this is a text field value',
                  },
                  {
                    key: 'duplicated_key',
                    type: CustomFieldTypes.TEXT,
                    value: 'this is a text field value',
                  },
                ],
              },
            ],
          },
          clientArgs,
          casesClient
        )
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to update case, ids: [{\\"id\\":\\"mock-id-1\\",\\"version\\":\\"WzAsMV0=\\"}]: Error: Invalid duplicated customFields keys in request: duplicated_key"`
      );
    });

    it('throws when customFields keys are not present in configuration', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                customFields: [
                  {
                    key: 'first_key',
                    type: CustomFieldTypes.TEXT,
                    value: 'this is a text field value',
                  },
                  {
                    key: 'missing_key',
                    type: CustomFieldTypes.TEXT,
                    value: null,
                  },
                ],
              },
            ],
          },
          clientArgs,
          casesClient
        )
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to update case, ids: [{\\"id\\":\\"mock-id-1\\",\\"version\\":\\"WzAsMV0=\\"}]: Error: Invalid custom field keys: missing_key"`
      );
    });

    it('throws error when required custom fields are null', async () => {
      casesClient.configure.get = jest.fn().mockResolvedValue([
        {
          owner: mockCases[0].attributes.owner,
          customFields: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT,
              label: 'missing field 1',
              required: true,
              defaultValue: 'default value',
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TOGGLE,
              label: 'missing field 2',
              required: true,
              defaultValue: true,
            },
          ],
        },
      ]);

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                customFields: [
                  {
                    key: 'first_key',
                    type: CustomFieldTypes.TEXT,
                    value: null,
                  },
                  {
                    key: 'second_key',
                    type: CustomFieldTypes.TOGGLE,
                    value: null,
                  },
                ],
              },
            ],
          },
          clientArgs,
          casesClient
        )
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to update case, ids: [{\\"id\\":\\"mock-id-1\\",\\"version\\":\\"WzAsMV0=\\"}]: Error: Invalid value \\"null\\" supplied for the following required custom fields: \\"missing field 1\\", \\"missing field 2\\""`
      );
    });

    it('throws error when required custom fields are undefined and missing a default value', async () => {
      casesClient.configure.get = jest.fn().mockResolvedValue([
        {
          owner: mockCases[0].attributes.owner,
          customFields: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT,
              label: 'missing field 1',
              required: true,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TOGGLE,
              label: 'missing field 2',
              required: true,
            },
          ],
        },
      ]);

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                customFields: [],
              },
            ],
          },
          clientArgs,
          casesClient
        )
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to update case, ids: [{\\"id\\":\\"mock-id-1\\",\\"version\\":\\"WzAsMV0=\\"}]: Error: All update fields are identical to current version."`
      );
    });

    it('throws when the customField types dont match the configuration', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                customFields: [
                  {
                    key: 'first_key',
                    type: CustomFieldTypes.TOGGLE,
                    value: true,
                  },
                  {
                    key: 'second_key',
                    type: CustomFieldTypes.TEXT,
                    value: 'foobar',
                  },
                ],
              },
            ],
          },
          clientArgs,
          casesClient
        )
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to update case, ids: [{\\"id\\":\\"mock-id-1\\",\\"version\\":\\"WzAsMV0=\\"}]: Error: The following custom fields have the wrong type in the request: \\"missing field 1\\", \\"foo\\""`
      );
    });
  });

  describe('Validation', () => {
    const clientArgsMock = createCasesClientMockArgs();

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgsMock.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
    });

    it(`throws an error when trying to update more than ${MAX_CASES_TO_UPDATE} cases`, async () => {
      await expect(
        bulkUpdate(
          {
            cases: Array(MAX_CASES_TO_UPDATE + 1).fill({
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              title: 'This is a test case!!',
            }),
          },
          clientArgsMock,
          casesClientMock
        )
      ).rejects.toThrow(
        'Error: The length of the field cases is too long. Array must be of length <= 100.'
      );
    });

    it('throws an error when trying to update zero cases', async () => {
      await expect(
        bulkUpdate(
          {
            cases: [],
          },
          clientArgsMock,
          casesClientMock
        )
      ).rejects.toThrow(
        'Error: The length of the field cases is too short. Array must be of length >= 1.'
      );
    });

    it('throws an error if the case is not found', async () => {
      clientArgsMock.services.caseService.getCases.mockResolvedValue({ saved_objects: [] });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses.open,
              },
            ],
          },
          clientArgsMock,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: These cases mock-id-1 do not exist. Please check you have the correct ids.'
      );
    });

    it('throws an error if the case is not found and the SO clients returns an SO object', async () => {
      clientArgsMock.services.caseService.getCases.mockResolvedValue({
        saved_objects: [
          {
            type: 'cases',
            id: 'mock-id-1',
            references: [],
            error: { error: 'Non found', message: 'Non found', statusCode: 404 },
          },
        ],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses.open,
              },
            ],
          },
          clientArgsMock,
          casesClientMock
        )
      ).rejects.toThrow(
        'Failed to update case, ids: [{"id":"mock-id-1","version":"WzAsMV0="}]: Error: These cases mock-id-1 do not exist. Please check you have the correct ids.'
      );
    });

    describe('Validate max user actions per page', () => {
      beforeEach(() => {
        jest.clearAllMocks();
        clientArgsMock.services.caseService.getCases.mockResolvedValue({
          saved_objects: [{ ...mockCases[0] }, { ...mockCases[1] }],
        });
        clientArgsMock.services.caseService.getAllCaseComments.mockResolvedValue({
          saved_objects: [],
          total: 0,
          per_page: 10,
          page: 1,
        });
      });

      it('passes validation if max user actions per case is not reached', async () => {
        clientArgsMock.services.userActionService.getMultipleCasesUserActionsTotal.mockResolvedValue(
          {
            [mockCases[0].id]: MAX_USER_ACTIONS_PER_CASE - 1,
          }
        );

        // @ts-ignore: only the array length matters here
        clientArgsMock.services.userActionService.creator.buildUserActions.mockReturnValue({
          [mockCases[0].id]: [1],
        });

        clientArgsMock.services.caseService.patchCases.mockResolvedValue({
          saved_objects: [{ ...mockCases[0] }],
        });

        await expect(
          bulkUpdate(
            {
              cases: [
                {
                  id: mockCases[0].id,
                  version: mockCases[0].version ?? '',
                  title: 'This is a test case!!',
                },
              ],
            },
            clientArgsMock,
            casesClientMock
          )
        ).resolves.not.toThrow();
      });

      it(`throws an error when the user actions to be created will reach ${MAX_USER_ACTIONS_PER_CASE}`, async () => {
        clientArgsMock.services.userActionService.getMultipleCasesUserActionsTotal.mockResolvedValue(
          {
            [mockCases[0].id]: MAX_USER_ACTIONS_PER_CASE,
          }
        );

        // @ts-ignore: only the array length matters here
        clientArgsMock.services.userActionService.creator.buildUserActions.mockReturnValue({
          [mockCases[0].id]: [1, 2, 3],
        });

        await expect(
          bulkUpdate(
            {
              cases: [
                {
                  id: mockCases[0].id,
                  version: mockCases[0].version ?? '',
                  title: 'This is a test case!!',
                },
              ],
            },
            clientArgsMock,
            casesClientMock
          )
        ).rejects.toThrow(
          `Error: The case with case id ${mockCases[0].id} has reached the limit of ${MAX_USER_ACTIONS_PER_CASE} user actions.`
        );
      });

      it('throws an error when trying to update multiple cases and one of them is expected to fail', async () => {
        clientArgsMock.services.userActionService.getMultipleCasesUserActionsTotal.mockResolvedValue(
          {
            [mockCases[0].id]: MAX_USER_ACTIONS_PER_CASE,
            [mockCases[1].id]: 0,
          }
        );

        // @ts-ignore: only the array length matters here
        clientArgsMock.services.userActionService.creator.buildUserActions.mockReturnValue({
          [mockCases[0].id]: [1, 2, 3],
          [mockCases[1].id]: [1],
        });

        await expect(
          bulkUpdate(
            {
              cases: [
                {
                  id: mockCases[0].id,
                  version: mockCases[0].version ?? '',
                  title: 'This is supposed to fail',
                },

                {
                  id: mockCases[1].id,
                  version: mockCases[1].version ?? '',
                  title: 'This is supposed to pass',
                },
              ],
            },
            clientArgsMock,
            casesClientMock
          )
        ).rejects.toThrow(
          `Error: The case with case id ${mockCases[0].id} has reached the limit of ${MAX_USER_ACTIONS_PER_CASE} user actions.`
        );
      });
    });

    describe('Authorization', () => {
      const clientArgs = createCasesClientMockArgs();

      beforeEach(() => {
        jest.clearAllMocks();
        clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
        clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
          saved_objects: [],
          total: 0,
          per_page: 10,
          page: 1,
        });
        clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
          new Map()
        );
      });

      it('checks authorization for updateCase operation', async () => {
        clientArgs.services.caseService.patchCases.mockResolvedValue({
          saved_objects: [{ ...mockCases[0] }],
        });

        await bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                title: 'Updated title',
              },
            ],
          },
          clientArgs,
          casesClientMock
        );

        expect(clientArgs.authorization.ensureAuthorized).toHaveBeenCalledWith({
          entities: [{ id: mockCases[0].id, owner: mockCases[0].attributes.owner }],
          operation: [Operations.updateCase],
        });
      });

      it('checks authorization for only reopenCase', async () => {
        // Mock a closed case
        const closedCase = {
          ...mockCases[0],
          attributes: {
            ...mockCases[0].attributes,
            status: CaseStatuses.closed,
          },
        };

        clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: [closedCase] });

        clientArgs.services.caseService.patchCases.mockResolvedValue({
          saved_objects: [{ ...closedCase }],
        });

        await bulkUpdate(
          {
            cases: [
              {
                id: closedCase.id,
                version: closedCase.version ?? '',
                status: CaseStatuses.open,
              },
            ],
          },
          clientArgs,
          casesClientMock
        );

        expect(clientArgs.authorization.ensureAuthorized).toHaveBeenCalledWith({
          entities: [{ id: closedCase.id, owner: closedCase.attributes.owner }],
          operation: [Operations.reopenCase],
        });
      });

      it('checks authorization for reopenCase and updateCase when reopening with extra fields', async () => {
        const closedCase = {
          ...mockCases[0],
          attributes: {
            ...mockCases[0].attributes,
            status: CaseStatuses.closed,
          },
        };

        clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: [closedCase] });

        clientArgs.services.caseService.patchCases.mockResolvedValue({
          saved_objects: [{ ...closedCase }],
        });

        await bulkUpdate(
          {
            cases: [
              {
                id: closedCase.id,
                version: closedCase.version ?? '',
                status: CaseStatuses.open,
                title: 'injected title',
              },
            ],
          },
          clientArgs,
          casesClientMock
        );

        expect(clientArgs.authorization.ensureAuthorized).toHaveBeenCalledWith({
          entities: [{ id: closedCase.id, owner: closedCase.attributes.owner }],
          operation: [Operations.reopenCase, Operations.updateCase],
        });
      });

      it('throws when a reopen request contains an injected title and the user lacks updateCase permission', async () => {
        const closedCase = {
          ...mockCases[0],
          attributes: { ...mockCases[0].attributes, status: CaseStatuses.closed },
        };
        clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: [closedCase] });
        clientArgs.authorization.ensureAuthorized.mockRejectedValue(new Error('Unauthorized'));

        await expect(
          bulkUpdate(
            {
              cases: [
                {
                  id: closedCase.id,
                  version: closedCase.version ?? '',
                  status: CaseStatuses.open,
                  title: 'injected title',
                },
              ],
            },
            clientArgs,
            casesClientMock
          )
        ).rejects.toThrow('Unauthorized');
      });

      it('throws when an assignee-change request contains an injected title and the user lacks updateCase permission', async () => {
        clientArgs.authorization.ensureAuthorized.mockRejectedValue(new Error('Unauthorized'));

        await expect(
          bulkUpdate(
            {
              cases: [
                {
                  id: mockCases[0].id,
                  version: mockCases[0].version ?? '',
                  assignees: [{ uid: '1' }],
                  title: 'injected title',
                },
              ],
            },
            clientArgs,
            casesClientMock
          )
        ).rejects.toThrow('Unauthorized');
      });

      it('throws when user is not authorized to update case', async () => {
        const error = new Error('Unauthorized');
        clientArgs.authorization.ensureAuthorized.mockRejectedValue(error);

        await expect(
          bulkUpdate(
            {
              cases: [
                {
                  id: mockCases[0].id,
                  version: mockCases[0].version ?? '',
                  title: 'Updated title',
                },
              ],
            },
            clientArgs,
            casesClientMock
          )
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Failed to update case, ids: [{\\"id\\":\\"mock-id-1\\",\\"version\\":\\"WzAsMV0=\\"}]: Error: Unauthorized"`
        );
      });
    });

    describe('Case close reason', () => {
      const clientArgs = createCasesClientMockArgs();

      beforeEach(() => {
        jest.clearAllMocks();
        clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
        clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
          saved_objects: [],
          total: 0,
          per_page: 10,
          page: 1,
        });
        clientArgs.services.caseService.patchCases.mockResolvedValue({
          saved_objects: [{ ...mockCases[0] }],
        });
        clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
          new Map()
        );
      });

      it('propagates closeReason to alerts without persisting it on cases', async () => {
        const closeReason = 'false_positive';
        const alertComment = {
          ...mockCaseComments[3],
          score: 0,
          references: [
            {
              ...mockCaseComments[3].references[0],
              id: mockCases[0].id,
            },
          ],
        };

        clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
          saved_objects: [alertComment],
          total: 1,
          per_page: 10,
          page: 1,
        });
        clientArgs.services.alertsService.updateAlertsStatus.mockResolvedValue(1);

        await bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses.closed,
                closeReason,
              },
            ],
          },
          clientArgs,
          casesClientMock
        );

        expect(clientArgs.services.alertsService.updateAlertsStatus).toHaveBeenCalledWith([
          {
            id: 'test-id',
            index: 'test-index',
            status: CaseStatuses.closed,
            closingReason: closeReason,
          },
        ]);

        const updatedAttributes =
          clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;

        expect(updatedAttributes).not.toHaveProperty('closeReason');
      });

      it('does not propagate empty closeReason values to alerts', async () => {
        const alertComment = {
          ...mockCaseComments[3],
          score: 0,
          references: [
            {
              ...mockCaseComments[3].references[0],
              id: mockCases[0].id,
            },
          ],
        };

        clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
          saved_objects: [alertComment],
          total: 1,
          per_page: 10,
          page: 1,
        });
        clientArgs.services.alertsService.updateAlertsStatus.mockResolvedValue(1);

        await bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses.closed,
                closeReason: '   ',
              },
            ],
          },
          clientArgs,
          casesClientMock
        );

        expect(clientArgs.services.alertsService.updateAlertsStatus).toHaveBeenCalledWith([
          {
            id: 'test-id',
            index: 'test-index',
            status: CaseStatuses.closed,
            closingReason: undefined,
          },
        ]);
      });

      it('propagates custom closeReason values to alerts', async () => {
        const closeReason = 'my custom reason';
        const alertComment = {
          ...mockCaseComments[3],
          score: 0,
          references: [
            {
              ...mockCaseComments[3].references[0],
              id: mockCases[0].id,
            },
          ],
        };

        clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
          saved_objects: [alertComment],
          total: 1,
          per_page: 10,
          page: 1,
        });
        clientArgs.services.alertsService.updateAlertsStatus.mockResolvedValue(1);

        await bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses.closed,
                closeReason,
              },
            ],
          },
          clientArgs,
          casesClientMock
        );

        expect(clientArgs.services.alertsService.updateAlertsStatus).toHaveBeenCalledWith([
          {
            id: 'test-id',
            index: 'test-index',
            status: CaseStatuses.closed,
            closingReason: closeReason,
          },
        ]);
      });

      it('returns synced alert count when only one of two alerts is updated', async () => {
        const closeReason = 'false_positive';
        const existingClosedAlertReason = 'benign_positive';
        const firstAlertComment = {
          ...mockCaseComments[3],
          score: 0,
          references: [{ ...mockCaseComments[3].references[0], id: mockCases[0].id }],
        };
        const secondAlertComment = {
          ...mockCaseComments[4],
          score: 0,
          references: [{ ...mockCaseComments[4].references[0], id: mockCases[0].id }],
        };

        clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
          saved_objects: [firstAlertComment, secondAlertComment],
          total: 2,
          per_page: 10,
          page: 1,
        });
        // Simulates alert A already being closed while alert B is open.
        const alertStateById = new Map([
          [
            'test-id',
            {
              status: CaseStatuses.closed,
              closingReason: existingClosedAlertReason,
            },
          ],
          [
            'test-id-2',
            {
              status: CaseStatuses.open,
              closingReason: undefined,
            },
          ],
        ]);
        clientArgs.services.alertsService.updateAlertsStatus.mockImplementation(async (alerts) => {
          let updatedAlertsCount = 0;
          alerts.forEach((alert) => {
            const currentAlert = alertStateById.get(alert.id);
            if (
              currentAlert?.status === CaseStatuses.open &&
              alert.status === CaseStatuses.closed
            ) {
              alertStateById.set(alert.id, {
                status: CaseStatuses.closed,
                closingReason: alert.closingReason,
              });
              updatedAlertsCount++;
            }
          });
          return updatedAlertsCount;
        });

        const result = await bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses.closed,
                closeReason,
              },
            ],
          },
          clientArgs,
          casesClientMock
        );

        expect(clientArgs.services.alertsService.updateAlertsStatus).toHaveBeenCalledWith([
          {
            id: 'test-id',
            index: 'test-index',
            status: CaseStatuses.closed,
            closingReason: closeReason,
          },
          {
            id: 'test-id-2',
            index: 'test-index-2',
            status: CaseStatuses.closed,
            closingReason: closeReason,
          },
        ]);
        expect(result[0]).toEqual(
          expect.objectContaining({
            updateSummary: {
              syncedAlertCount: 1,
            },
          })
        );
        expect(alertStateById.get('test-id')).toEqual({
          status: CaseStatuses.closed,
          closingReason: existingClosedAlertReason,
        });
        expect(alertStateById.get('test-id-2')).toEqual({
          status: CaseStatuses.closed,
          closingReason: closeReason,
        });
      });

      it('does not update alerts with an invalid close reason', async () => {
        const invalidCloseReason = 'invalid_reason';
        const clientArgsWithValidator = {
          ...clientArgs,
          closeReasonValidator: jest.fn().mockResolvedValue(false),
        };

        await expect(
          bulkUpdate(
            {
              cases: [
                {
                  id: mockCases[0].id,
                  version: mockCases[0].version ?? '',
                  status: CaseStatuses.closed,
                  closeReason: invalidCloseReason,
                },
              ],
            },
            clientArgsWithValidator,
            casesClientMock
          )
        ).rejects.toThrow(`Invalid close reason: "${invalidCloseReason}"`);

        expect(clientArgs.services.alertsService.updateAlertsStatus).not.toHaveBeenCalled();
      });

      it('does not propagate closeReason when status is not closed', async () => {
        const closeReason = 'false_positive';
        const firstAlertComment = {
          ...mockCaseComments[3],
          score: 0,
          references: [{ ...mockCaseComments[3].references[0], id: mockCases[0].id }],
        };

        clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
          saved_objects: [firstAlertComment],
          total: 1,
          per_page: 10,
          page: 1,
        });
        clientArgs.services.alertsService.updateAlertsStatus.mockResolvedValue(1);

        await bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses['in-progress'],
                closeReason,
              },
            ],
          },
          clientArgs,
          casesClientMock
        );

        expect(clientArgs.services.alertsService.updateAlertsStatus).toHaveBeenCalledWith([
          {
            id: 'test-id',
            index: 'test-index',
            status: CaseStatuses['in-progress'],
            closingReason: undefined,
          },
        ]);
      });

      it('returns per-case synced alert count', async () => {
        const alertComment = {
          ...mockCaseComments[3],
          score: 0,
          references: [
            {
              ...mockCaseComments[3].references[0],
              id: mockCases[0].id,
            },
          ],
        };
        clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
          saved_objects: [alertComment],
          total: 1,
          per_page: 10,
          page: 1,
        });

        clientArgs.services.alertsService.updateAlertsStatus.mockResolvedValue(3);

        const result = await bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses.closed,
              },
            ],
          },
          clientArgs,
          casesClientMock
        );

        expect(result[0]).toEqual(
          expect.objectContaining({
            updateSummary: {
              syncedAlertCount: 3,
            },
          })
        );
        expect(clientArgs.services.alertsService.updateAlertsStatus).toHaveBeenCalled();
      });

      it('omits updateSummary when no alerts are synced', async () => {
        const result = await bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses['in-progress'],
              },
            ],
          },
          clientArgs,
          casesClientMock
        );

        expect(result[0]).not.toHaveProperty('updateSummary');
      });
    });
  });

  describe('Detection status sync', () => {
    const clientArgs = createCasesClientMockArgs();

    type FoundAttachment = SavedObjectsFindResult<AttachmentAttributes>;

    const attachmentBase = {
      created_at: '2019-11-25T22:32:30.608Z',
      created_by: { full_name: 'elastic', email: 'testemail@elastic.co', username: 'elastic' },
      owner: SECURITY_SOLUTION_OWNER,
      pushed_at: null,
      pushed_by: null,
      updated_at: '2019-11-25T22:32:30.608Z',
      updated_by: { full_name: 'elastic', email: 'testemail@elastic.co', username: 'elastic' },
    };

    const caseReference = [
      { type: 'cases', name: 'associated-cases', id: mockCases[0].id },
    ] as const;

    const attackAttachment = {
      type: CASE_ATTACHMENT_SAVED_OBJECT,
      id: 'mock-attack-attachment-1',
      attributes: {
        ...attachmentBase,
        type: SECURITY_ATTACK_ATTACHMENT_TYPE,
        attachmentId: 'attack-doc-1',
        metadata: {
          title: 'Credential harvesting',
          alertCount: 1,
          index: 'alerts-security.attack.discovery.alerts',
        },
      },
      references: [...caseReference],
      score: 0,
      updated_at: '2019-11-25T22:32:30.608Z',
      version: 'WzYsMV0=',
    } as unknown as FoundAttachment;

    const entityAttachment = {
      type: CASE_ATTACHMENT_SAVED_OBJECT,
      id: 'mock-entity-attachment-1',
      attributes: {
        ...attachmentBase,
        type: SECURITY_ENTITY_ATTACHMENT_TYPE,
        attachmentId: 'host-1',
        metadata: { entityType: 'host' },
      },
      references: [...caseReference],
      score: 0,
      updated_at: '2019-11-25T22:32:30.608Z',
      version: 'WzYsMV0=',
    } as unknown as FoundAttachment;

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [{ ...mockCases[0] }],
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
      clientArgs.services.alertsService.updateAlertsStatus.mockResolvedValue(1);
    });

    const mockAttachments = (savedObjects: FoundAttachment[]) => {
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: savedObjects,
        total: savedObjects.length,
        per_page: 10,
        page: 1,
      });
    };

    const patchStatus = async (status: CaseStatuses, closeReason?: string) =>
      bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              status,
              ...(closeReason != null ? { closeReason } : {}),
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

    it('closes the attack document alongside its attached alerts', async () => {
      const alertAttachment = {
        ...mockCaseComments[3],
        score: 0,
        references: [{ ...mockCaseComments[3].references[0], id: mockCases[0].id }],
      } as unknown as FoundAttachment;

      mockAttachments([attackAttachment, alertAttachment]);

      await patchStatus(CaseStatuses.closed, 'false_positive');

      expect(clientArgs.services.alertsService.updateAlertsStatus).toHaveBeenCalledWith([
        {
          id: 'attack-doc-1',
          index: 'alerts-security.attack.discovery.alerts',
          status: CaseStatuses.closed,
          closingReason: 'false_positive',
        },
        {
          id: 'test-id',
          index: 'test-index',
          status: CaseStatuses.closed,
          closingReason: 'false_positive',
        },
      ]);
    });

    it('syncs an attack attached from the adhoc index', async () => {
      mockAttachments([
        {
          ...attackAttachment,
          attributes: {
            ...attackAttachment.attributes,
            metadata: {
              title: 'Credential harvesting',
              alertCount: 0,
              index: '.adhoc.alerts-security.attack.discovery.alerts',
            },
          },
        } as unknown as FoundAttachment,
      ]);

      await patchStatus(CaseStatuses['in-progress']);

      expect(clientArgs.services.alertsService.updateAlertsStatus).toHaveBeenCalledWith([
        {
          id: 'attack-doc-1',
          index: '.adhoc.alerts-security.attack.discovery.alerts',
          status: CaseStatuses['in-progress'],
          closingReason: undefined,
        },
      ]);
    });

    it('moves the attack document to in-progress with the case', async () => {
      mockAttachments([attackAttachment]);

      await patchStatus(CaseStatuses['in-progress']);

      expect(clientArgs.services.alertsService.updateAlertsStatus).toHaveBeenCalledWith([
        {
          id: 'attack-doc-1',
          index: 'alerts-security.attack.discovery.alerts',
          status: CaseStatuses['in-progress'],
          closingReason: undefined,
        },
      ]);
    });

    it('ignores attachment types that carry no workflow status', async () => {
      mockAttachments([entityAttachment]);

      await patchStatus(CaseStatuses.closed, 'false_positive');

      expect(clientArgs.services.alertsService.updateAlertsStatus).not.toHaveBeenCalled();
    });
  });

  describe('Global extended_fields — per-owner key isolation', () => {
    const clientArgs = createCasesClientMockArgs();

    const makeGlobalFieldDef = (name: string, owner: string) => ({
      fieldDefinitionId: `fd-${name}`,
      name,
      owner,
      description: '',
      isGlobal: true,
      definition: yamlStringify({ name, type: 'keyword', control: 'INPUT_TEXT', label: name }),
    });

    const secCase = {
      ...mockCases[0],
      attributes: { ...mockCases[0].attributes, owner: SECURITY_SOLUTION_OWNER },
    };

    const obsCase = {
      ...mockCases[1],
      attributes: { ...mockCases[1].attributes, owner: OBSERVABILITY_OWNER },
    };

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.services.caseService.getCases.mockResolvedValue({
        saved_objects: [secCase, obsCase],
      });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [secCase, obsCase],
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
      clientArgs.services.userActionService.getMultipleCasesUserActionsTotal.mockResolvedValue({
        [secCase.id]: 0,
        [obsCase.id]: 0,
      });
    });

    it('calls fieldDefinitionsService once per unique owner, not once per case', async () => {
      // Both owners have a global field — register them per owner.
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockImplementation(
        async (owner: string | string[]) => {
          const o = Array.isArray(owner) ? owner[0] : owner;
          if (o === SECURITY_SOLUTION_OWNER) {
            return {
              fieldDefinitions: [makeGlobalFieldDef('risk_score', SECURITY_SOLUTION_OWNER)],
              total: 1,
            };
          }
          if (o === OBSERVABILITY_OWNER) {
            return {
              fieldDefinitions: [makeGlobalFieldDef('service_name', OBSERVABILITY_OWNER)],
              total: 1,
            };
          }
          return { fieldDefinitions: [], total: 0 };
        }
      );

      await bulkUpdate(
        {
          cases: [
            {
              id: secCase.id,
              version: secCase.version ?? '',
              extended_fields: { risk_score_as_keyword: 'high' },
            },
            {
              id: obsCase.id,
              version: obsCase.version ?? '',
              extended_fields: { service_name_as_keyword: 'api' },
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      // Bounded per unique owner (2 owners), not per case: one fetch for global-field
      // resolution plus one for the pairing-adapter link indexes per owner.
      expect(clientArgs.services.fieldDefinitionsService.getFieldDefinitions).toHaveBeenCalledTimes(
        4
      );
    });

    it('rejects a non-global extended_fields key for one owner while allowing the other', async () => {
      // securitySolution has global field 'risk_score'; observability has none.
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockImplementation(
        async (owner: string | string[]) => {
          const o = Array.isArray(owner) ? owner[0] : owner;
          if (o === SECURITY_SOLUTION_OWNER) {
            return {
              fieldDefinitions: [makeGlobalFieldDef('risk_score', SECURITY_SOLUTION_OWNER)],
              total: 1,
            };
          }
          return { fieldDefinitions: [], total: 0 };
        }
      );

      // Sending the securitySolution global key for the observability case should fail.
      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: obsCase.id,
                version: obsCase.version ?? '',
                extended_fields: { risk_score_as_keyword: 'high' },
              },
            ],
          },
          clientArgs,
          casesClientMock
        )
      ).rejects.toThrow(
        'Unknown extended field key: "risk_score_as_keyword". No fields are available for this case'
      );
    });
  });

  describe('Metrics', () => {
    const clientArgs = createCasesClientMockArgs();

    beforeEach(() => {
      jest.clearAllMocks();
      clientArgs.services.caseService.getCases.mockResolvedValue({ saved_objects: mockCases });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });

      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: mockCases,
      });

      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
    });

    it('calculates metrics correctly', async () => {
      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              status: CaseStatuses.closed,
            },
          ],
        },
        clientArgs,
        casesClientMock
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;

      expect(updatedAttributes.time_to_acknowledge).toEqual(expect.any(Number));
      expect(updatedAttributes.time_to_investigate).toEqual(expect.any(Number));
      expect(updatedAttributes.time_to_resolve).toEqual(expect.any(Number));
    });
  });

  describe('customFields → extended_fields adapter (write-time mirror)', () => {
    const casesClientMock2 = createCasesClientMock();
    casesClientMock2.configure.get = jest.fn().mockResolvedValue([]);

    const customFieldsCfg = [
      {
        key: 'priority',
        type: CustomFieldTypes.TEXT as const,
        label: 'Priority',
        required: false,
      },
      {
        key: 'count',
        type: CustomFieldTypes.NUMBER as const,
        label: 'Count',
        required: false,
      },
    ];

    const patchPayload = [
      {
        key: 'priority',
        type: CustomFieldTypes.TEXT as const,
        value: 'high',
      },
      {
        key: 'count',
        type: CustomFieldTypes.NUMBER as const,
        value: 3,
      },
    ];

    const setupMocks = (
      clientArgs: ReturnType<typeof createCasesClientMockArgs>,
      originalExtendedFields?: Record<string, string>
    ) => {
      const originalCase = {
        ...mockCases[0],
        attributes: {
          ...mockCases[0].attributes,
          ...(originalExtendedFields != null ? { extended_fields: originalExtendedFields } : {}),
        },
      };
      clientArgs.services.caseService.getCases.mockResolvedValue({
        saved_objects: [originalCase],
      });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [originalCase],
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
      // Linked v2 definitions for the configured v1 fields — write-time mirroring
      // only writes keys that resolve to a definition (via legacyKey or name).
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [
          {
            fieldDefinitionId: 'fd-priority',
            name: 'priority',
            owner: mockCases[0].attributes.owner,
            description: '',
            isGlobal: true,
            legacyKey: 'priority',
            definition: yamlStringify({
              name: 'priority',
              type: 'keyword',
              control: 'INPUT_TEXT',
              label: 'Priority',
            }),
          },
          {
            fieldDefinitionId: 'fd-count',
            name: 'count',
            owner: mockCases[0].attributes.owner,
            description: '',
            isGlobal: true,
            legacyKey: 'count',
            definition: yamlStringify({
              name: 'count',
              type: 'integer',
              control: 'INPUT_NUMBER',
              label: 'Count',
            }),
          },
        ],
        total: 2,
      });
      casesClientMock2.configure.get = jest
        .fn()
        .mockResolvedValue([
          { owner: mockCases[0].attributes.owner, customFields: customFieldsCfg },
        ]);
    };

    it('mirrors customFields into extended_fields when templates flag is enabled', async () => {
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupMocks(clientArgs);

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              customFields: patchPayload,
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      expect(updatedAttributes.extended_fields).toMatchObject({
        priority_as_keyword: 'high',
        count_as_integer: '3',
      });
    });

    it('mirrors customFields even when templates flag is disabled (addendum A1)', async () => {
      // Pairing for existing links runs independently of the feature flag: once
      // a link exists, live sync must not depend on xpack.cases.templates.enabled.
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: false } };
      setupMocks(clientArgs);

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              customFields: patchPayload,
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      expect(updatedAttributes.extended_fields).toMatchObject({
        priority_as_keyword: 'high',
        count_as_integer: '3',
      });
    });

    it('does not touch extended_fields when update omits customFields', async () => {
      // FAILURE SCENARIO: adapter mirrors on every update, clobbering extended_fields
      // written by the v2 UI even when this update was not about customFields.
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupMocks(clientArgs, { existing_key_as_keyword: 'v2value' });

      await bulkUpdate(
        {
          cases: [{ id: mockCases[0].id, version: mockCases[0].version ?? '', title: 'New Title' }],
        },
        clientArgs,
        casesClientMock2
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      expect(updatedAttributes.extended_fields).toBeUndefined();
    });

    it('overrides an existing mirror key when the customField value changes (customFields-win)', async () => {
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      // original case has priority_as_keyword: 'critical' — customFields-win must override it
      setupMocks(clientArgs, { priority_as_keyword: 'critical' });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              customFields: [
                { key: 'priority', type: CustomFieldTypes.TEXT as const, value: 'low' },
              ],
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      // Value changed — extended_fields must appear in the patch payload with the new value.
      expect(updatedAttributes.extended_fields).toEqual({ priority_as_keyword: 'low' });
    });

    it('omits extended_fields from the patch payload when the customField value is unchanged', async () => {
      // FAILURE SCENARIO: adapter sets extended_fields on every customFields update, even when
      // the value is identical — causing a spurious SO write and an unnecessary user action.
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      // original case has priority_as_keyword: 'low' — same as the incoming value
      setupMocks(clientArgs, { priority_as_keyword: 'low' });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              customFields: [
                { key: 'priority', type: CustomFieldTypes.TEXT as const, value: 'low' },
              ],
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      // Value is identical — no spurious write.
      expect(updatedAttributes.extended_fields).toBeUndefined();
    });

    it('preserves an unrelated mirror key when the update omits that customField (synthetic-null regression)', async () => {
      // FAILURE SCENARIO (before fix): fillMissingCustomFields pads { key: 'priority', value: null }
      // for the absent 'priority' field; the merge then deletes priority_as_keyword — silently
      // wiping a value stored via the v2 UI that this update never intended to clear.
      // Fix: mirror only request-provided customFields (updateCaseAttributes.customFields).
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      // Original case has priority_as_keyword set via the v2 UI; priority is optional-no-default.
      setupMocks(clientArgs, { priority_as_keyword: 'crit' });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              // Only count is being updated — priority is intentionally absent.
              customFields: [{ key: 'count', type: CustomFieldTypes.NUMBER as const, value: 3 }],
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      // priority was not submitted — its mirror key must be preserved.
      expect(updatedAttributes.extended_fields?.priority_as_keyword).toBe('crit');
    });

    it('clears the mirror key when the user explicitly submits null for a customField', async () => {
      // Guard: confirms that an *intentional* null (user cleared the field) still deletes the
      // mirror key — the synthetic-null fix must not prevent deliberate clears.
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      // Original case has priority_as_keyword set.
      setupMocks(clientArgs, { priority_as_keyword: 'crit' });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              // User explicitly clears priority by submitting null.
              customFields: [
                { key: 'priority', type: CustomFieldTypes.TEXT as const, value: null },
              ],
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      // Explicit null — the mirror key must be deleted.
      expect(updatedAttributes.extended_fields).not.toHaveProperty('priority_as_keyword');
    });

    it('resolves global fields once per owner even when concurrent cases race the lazy cache', async () => {
      // Neither case's request includes `extended_fields` or a status transition, so the
      // pre-resolution pass (uniqueOwnersNeedingFields) skips this owner entirely — only
      // pairing-derived extended_fields changes (from customFields) reach the LAZY fallback
      // cache inside createPatchCasesPayload, which is where two same-owner cases processed
      // under one Promise.all could previously race and double-fetch.
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      const secondCase = { ...mockCases[0], id: 'mock-id-2' };
      setupMocks(clientArgs);
      clientArgs.services.caseService.getCases.mockResolvedValue({
        saved_objects: [mockCases[0], secondCase],
      });
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [mockCases[0], secondCase],
      });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              customFields: patchPayload,
            },
            {
              id: secondCase.id,
              version: secondCase.version ?? '',
              customFields: patchPayload,
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      const globalFieldsLookups =
        clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mock.calls.filter(
          ([, options]) => options?.isGlobal === true
        );
      expect(globalFieldsLookups).toHaveLength(1);
    });

    it('derives the linked customFields entry from a v2-originated extended_fields update', async () => {
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupMocks(clientArgs);

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              extended_fields: { count_as_integer: '42' },
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      expect(updatedAttributes.extended_fields).toMatchObject({ count_as_integer: '42' });
      // The linked v1 entry is derived through the reversible codec (42, not '42').
      expect(updatedAttributes.customFields).toEqual(
        expect.arrayContaining([{ key: 'count', type: CustomFieldTypes.NUMBER, value: 42 }])
      );
    });

    it('treats an explicit v2 empty string as clear: removes the key and nulls the v1 entry', async () => {
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupMocks(clientArgs, { priority_as_keyword: 'crit' });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              extended_fields: { priority_as_keyword: '' },
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      expect(updatedAttributes.extended_fields).not.toHaveProperty('priority_as_keyword');
      expect(updatedAttributes.customFields).toEqual(
        expect.arrayContaining([{ key: 'priority', type: CustomFieldTypes.TEXT, value: null }])
      );
    });

    it('rejects conflicting explicit dual input with a structured 400 instead of picking a side', async () => {
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupMocks(clientArgs);

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                customFields: [
                  { key: 'priority', type: CustomFieldTypes.TEXT as const, value: 'low' },
                ],
                extended_fields: { priority_as_keyword: 'critical' },
              },
            ],
          },
          clientArgs,
          casesClientMock2
        )
      ).rejects.toThrow(
        'conflicting values for both representations of the linked field(s): "priority"'
      );

      expect(clientArgs.services.caseService.patchCases).not.toHaveBeenCalled();
    });

    it('records the paired storage keys on the patch payload for user-action suppression', async () => {
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupMocks(clientArgs);

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              customFields: patchPayload,
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      const patchedCase = clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0];
      expect(patchedCase.pairedCustomFieldStorageKeys).toEqual({
        priority: 'priority_as_keyword',
        count: 'count_as_integer',
      });
    });

    it('passes the mirrored extended_fields to emitCaseUpdated.extraInfo when updatedFields is [customFields]', async () => {
      /*
       * FAILURE SCENARIO: if patchCases echoes back the original SO (without mirrored
       * extended_fields in attributes) then updatedCase.extended_fields stays pre-mirror,
       * and the event bridge would compute an empty diff — never firing the trigger.
       */
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupMocks(clientArgs);

      // Override patchCases to echo the post-mirror SO (as the real Elasticsearch response would).
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [
          {
            ...mockCases[0],
            attributes: {
              ...mockCases[0].attributes,
              extended_fields: { priority_as_keyword: 'high' },
            },
          },
        ],
      });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              customFields: [
                { key: 'priority', type: CustomFieldTypes.TEXT as const, value: 'high' },
              ],
            },
          ],
        },
        clientArgs,
        casesClientMock2
      );

      expect(clientArgs.casesEventBus.emitCaseUpdated).toHaveBeenCalledWith(
        clientArgs.request,
        expect.objectContaining({ updatedFields: expect.arrayContaining(['customFields']) }),
        expect.objectContaining({
          updatedCase: expect.objectContaining({
            extended_fields: expect.objectContaining({ priority_as_keyword: 'high' }),
          }),
        })
      );
    });
  });

  describe('close validation against the final paired extended_fields', () => {
    // A linked global field that is required on close. The v1 side is optional so write-time
    // validation never interferes — only the close-time required_on_close rule is exercised.
    const casesClientMock3 = createCasesClientMock();

    const closeCustomFieldsCfg = [
      {
        key: 'priority',
        type: CustomFieldTypes.TEXT as const,
        label: 'Priority',
        required: false,
      },
    ];

    const setupCloseMocks = (
      clientArgs: ReturnType<typeof createCasesClientMockArgs>,
      {
        originalExtendedFields,
        originalCustomFields,
      }: {
        originalExtendedFields?: Record<string, string>;
        originalCustomFields?: Array<{
          key: string;
          type: CustomFieldTypes.TEXT;
          value: string | null;
        }>;
      } = {}
    ) => {
      const originalCase = {
        ...mockCases[0],
        attributes: {
          ...mockCases[0].attributes,
          ...(originalExtendedFields != null ? { extended_fields: originalExtendedFields } : {}),
          ...(originalCustomFields != null ? { customFields: originalCustomFields } : {}),
        },
      };
      clientArgs.services.caseService.getCases.mockResolvedValue({
        saved_objects: [originalCase],
      });
      clientArgs.services.caseService.getAllCaseComments.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: 10,
        page: 1,
      });
      clientArgs.services.caseService.patchCases.mockResolvedValue({
        saved_objects: [originalCase],
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [
          {
            fieldDefinitionId: 'fd-priority',
            name: 'priority',
            owner: mockCases[0].attributes.owner,
            description: '',
            isGlobal: true,
            legacyKey: 'priority',
            definition: yamlStringify({
              name: 'priority',
              type: 'keyword',
              control: 'INPUT_TEXT',
              label: 'Priority',
              validation: { required_on_close: true },
            }),
          },
        ],
        total: 1,
      });
      casesClientMock3.configure.get = jest
        .fn()
        .mockResolvedValue([
          { owner: mockCases[0].attributes.owner, customFields: closeCustomFieldsCfg },
        ]);
    };

    it('rejects clear-and-close when the linked field is cleared via customFields', async () => {
      // REGRESSION (the bug this guards): pairing deletes priority_as_keyword from the final
      // extended_fields, but close validation used to merge the original stored value back in,
      // see the old value, and allow closing a case that is missing a required-on-close field.
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupCloseMocks(clientArgs, {
        originalExtendedFields: { priority_as_keyword: 'crit' },
        originalCustomFields: [{ key: 'priority', type: CustomFieldTypes.TEXT, value: 'crit' }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses.closed,
                customFields: [
                  { key: 'priority', type: CustomFieldTypes.TEXT as const, value: null },
                ],
              },
            ],
          },
          clientArgs,
          casesClientMock3
        )
      ).rejects.toThrow(
        `Cannot close case ${mockCases[0].id}, required fields must be filled: Field "Priority" is required`
      );

      expect(clientArgs.services.caseService.patchCases).not.toHaveBeenCalled();
    });

    it('rejects clear-and-close when the linked field is cleared via an empty extended_fields value', async () => {
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupCloseMocks(clientArgs, {
        originalExtendedFields: { priority_as_keyword: 'crit' },
        originalCustomFields: [{ key: 'priority', type: CustomFieldTypes.TEXT, value: 'crit' }],
      });

      await expect(
        bulkUpdate(
          {
            cases: [
              {
                id: mockCases[0].id,
                version: mockCases[0].version ?? '',
                status: CaseStatuses.closed,
                extended_fields: { priority_as_keyword: '' },
              },
            ],
          },
          clientArgs,
          casesClientMock3
        )
      ).rejects.toThrow(
        `Cannot close case ${mockCases[0].id}, required fields must be filled: Field "Priority" is required`
      );

      expect(clientArgs.services.caseService.patchCases).not.toHaveBeenCalled();
    });

    it('allows fill-and-close when the value is supplied via customFields', async () => {
      // The paired value must be visible to close validation even though the request never
      // touched extended_fields directly.
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupCloseMocks(clientArgs);

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              status: CaseStatuses.closed,
              customFields: [
                { key: 'priority', type: CustomFieldTypes.TEXT as const, value: 'fixed' },
              ],
            },
          ],
        },
        clientArgs,
        casesClientMock3
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      expect(updatedAttributes.status).toEqual(CaseStatuses.closed);
      expect(updatedAttributes.extended_fields).toMatchObject({ priority_as_keyword: 'fixed' });
      expect(updatedAttributes.customFields).toEqual(
        expect.arrayContaining([{ key: 'priority', type: CustomFieldTypes.TEXT, value: 'fixed' }])
      );
    });

    it('allows fill-and-close when the value is supplied via extended_fields', async () => {
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupCloseMocks(clientArgs);

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              status: CaseStatuses.closed,
              extended_fields: { priority_as_keyword: 'fixed' },
            },
          ],
        },
        clientArgs,
        casesClientMock3
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      expect(updatedAttributes.status).toEqual(CaseStatuses.closed);
      expect(updatedAttributes.extended_fields).toMatchObject({ priority_as_keyword: 'fixed' });
      expect(updatedAttributes.customFields).toEqual(
        expect.arrayContaining([{ key: 'priority', type: CustomFieldTypes.TEXT, value: 'fixed' }])
      );
    });

    it('still allows clearing a required-on-close field while the case stays open', async () => {
      // required_on_close only gates the transition to closed — clearing on an open case is a
      // normal edit.
      const clientArgs = createCasesClientMockArgs();
      clientArgs.config = { ...clientArgs.config, templates: { enabled: true } };
      setupCloseMocks(clientArgs, {
        originalExtendedFields: { priority_as_keyword: 'crit' },
        originalCustomFields: [{ key: 'priority', type: CustomFieldTypes.TEXT, value: 'crit' }],
      });

      await bulkUpdate(
        {
          cases: [
            {
              id: mockCases[0].id,
              version: mockCases[0].version ?? '',
              customFields: [
                { key: 'priority', type: CustomFieldTypes.TEXT as const, value: null },
              ],
            },
          ],
        },
        clientArgs,
        casesClientMock3
      );

      const updatedAttributes =
        clientArgs.services.caseService.patchCases.mock.calls[0][0].cases[0].updatedAttributes;
      expect(updatedAttributes.extended_fields).not.toHaveProperty('priority_as_keyword');
      expect(updatedAttributes.customFields).toEqual(
        expect.arrayContaining([{ key: 'priority', type: CustomFieldTypes.TEXT, value: null }])
      );
    });
  });
});
