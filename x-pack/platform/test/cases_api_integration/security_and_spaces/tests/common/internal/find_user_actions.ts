/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { Case } from '@kbn/cases-plugin/common/types/domain';
import { AttachmentType, CaseSeverity, CaseStatuses } from '@kbn/cases-plugin/common/types/domain';
import {
  MAX_USER_ACTIONS_PER_PAGE,
  MAX_USER_ACTION_SEARCH_LENGTH,
  MAX_USER_ACTION_AUTHOR_LENGTH,
} from '@kbn/cases-plugin/common/constants';
import type { CommentUserAction } from '@kbn/cases-plugin/common/types/domain';
import { UserActionTypes, ConnectorTypes } from '@kbn/cases-plugin/common/types/domain';
import {
  globalRead,
  noKibanaPrivileges,
  obsOnly,
  obsOnlyRead,
  secOnly,
  secOnlyRead,
  superUser,
} from '../../../../common/lib/authentication/users';
import {
  getPostCaseRequest,
  persistableStateAttachment,
  postCommentActionsReq,
  postCommentAlertReq,
  postCommentUserReq,
  postExternalReferenceESReq,
} from '../../../../common/lib/mock';
import {
  deleteAllCaseItems,
  createCase,
  updateCase,
  createComment,
  bulkCreateAttachments,
  findInternalCaseUserActions,
  updateComment,
} from '../../../../common/lib/api';

import type { FtrProviderContext } from '../../../../common/ftr_provider_context';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('find_user_actions (internal)', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    it('returns the id and version fields', async () => {
      const theCase = await createCase(supertest, getPostCaseRequest());

      const response = await findInternalCaseUserActions({
        caseID: theCase.id,
        supertest,
      });

      expect(response.userActions.length).to.be(1);
      expect(response.userActions[0].id).not.to.be(undefined);
      expect(response.userActions[0].version).not.to.be(undefined);
      expect(response.latestAttachments.length).to.be(0);
    });

    describe('default parameters', () => {
      it('performs a search using the default parameters when no query params are sent', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await createComment({
          supertest,
          caseId: theCase.id,
          params: postCommentUserReq,
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
        });

        expect(response.userActions.length).to.be(2);
        expect(response.latestAttachments.length).to.be(1);

        const createCaseUserAction = response.userActions[0];
        expect(createCaseUserAction.type).to.eql('create_case');
        expect(createCaseUserAction.action).to.eql('create');

        const commentUserAction = response.userActions[1];
        expect(commentUserAction.type).to.eql('comment');
        expect(commentUserAction.action).to.eql('create');

        expect(response.page).to.be(1);
        expect(response.perPage).to.be(20);
        expect(response.total).to.be(2);
      });

      it('should return latest attachments', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        const patchedCase = await createComment({
          supertest,
          caseId: theCase.id,
          params: postCommentUserReq,
        });

        const newComment = 'this is an edited comment';
        await updateComment({
          supertest,
          caseId: theCase.id,
          req: {
            id: patchedCase.comments![0].id,
            version: patchedCase.comments![0].version,
            comment: newComment,
            type: AttachmentType.user,
            owner: 'securitySolutionFixture',
          },
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
        });

        expect(response.userActions.length).to.be(3);
        expect(response.latestAttachments.length).to.be(1);

        const attachment = response.latestAttachments[0];
        expect(attachment.type).to.eql('comment');
        // just to make TS happy
        if (attachment.type === 'comment' && 'data' in attachment) {
          expect(attachment.data?.content).to.eql('this is an edited comment');
        }
        expect(attachment.id).to.eql(response.userActions[1].comment_id);
      });
    });

    describe('sorting', () => {
      it('sorts the results in descending order by the created_at field', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await createComment({
          supertest,
          caseId: theCase.id,
          params: postCommentUserReq,
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'desc',
            types: [UserActionTypes.comment, UserActionTypes.create_case],
          },
        });

        expect(response.userActions.length).to.be(2);
        expect(response.latestAttachments.length).to.be(1);

        const commentUserAction = response.userActions[0];
        expect(commentUserAction.type).to.eql('comment');
        expect(commentUserAction.action).to.eql('create');
      });
    });

    describe('pagination', () => {
      let theCase: Case;

      beforeEach(async () => {
        theCase = await createCase(supertest, getPostCaseRequest());

        await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [postCommentUserReq, postCommentUserReq],
        });
      });

      it('retrieves only 1 user action when perPage is 1', async () => {
        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.comment, UserActionTypes.create_case],
            perPage: 1,
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(0);

        const commentUserAction = response.userActions[0];
        expect(commentUserAction.type).to.eql('create_case');
        expect(commentUserAction.action).to.eql('create');
      });

      it('retrieves 2 user action when perPage is 2 and there are 3 user actions', async () => {
        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.comment, UserActionTypes.create_case],
            perPage: 2,
          },
        });

        expect(response.userActions.length).to.be(2);
        expect(response.latestAttachments.length).to.be(1);
        expect(response.total).to.be(3);

        const createCaseUserAction = response.userActions[0];
        expect(createCaseUserAction.type).to.eql('create_case');
        expect(createCaseUserAction.action).to.eql('create');

        const commentUserAction = response.userActions[1];
        expect(commentUserAction.type).to.eql('comment');
        expect(commentUserAction.action).to.eql('create');
      });

      it('retrieves the second page of results', async () => {
        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.comment, UserActionTypes.create_case],
            page: 2,
            perPage: 1,
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(1);
        expect(response.total).to.be(3);
        expect(response.userActions[0].type).to.eql('comment');
        expect(response.userActions[0].action).to.eql('create');
      });

      it('retrieves the third page of results', async () => {
        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.comment, UserActionTypes.create_case],
            page: 3,
            perPage: 1,
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(1);
        expect(response.total).to.be(3);
        expect(response.userActions[0].type).to.eql('comment');
        expect(response.userActions[0].action).to.eql('create');
      });

      it('retrieves all the results with a perPage larger than the total', async () => {
        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.comment, UserActionTypes.create_case],
            page: 1,
            perPage: 10,
          },
        });

        expect(response.userActions.length).to.be(3);
        expect(response.latestAttachments.length).to.be(2);
        expect(response.total).to.be(3);
        expect(response.userActions[0].type).to.eql('create_case');
        expect(response.userActions[0].action).to.eql('create');
      });

      it(`400s when perPage > ${MAX_USER_ACTIONS_PER_PAGE} supplied`, async () => {
        await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: { perPage: MAX_USER_ACTIONS_PER_PAGE + 1 },
          expectedHttpCode: 400,
        });
      });

      it('400s when trying to fetch more than 10,000 documents', async () => {
        await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: { page: 209, perPage: 100 },
          expectedHttpCode: 400,
        });
      });

      it('400s when the search term is too long', async () => {
        await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: { search: 'a'.repeat(MAX_USER_ACTION_SEARCH_LENGTH + 1) },
          expectedHttpCode: 400,
        });
      });

      it('400s when the author is too long', async () => {
        await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: { author: 'a'.repeat(MAX_USER_ACTION_AUTHOR_LENGTH + 1) },
          expectedHttpCode: 400,
        });
      });
    });

    describe('filters using the type query parameter', () => {
      it('returns a 400 when filtering for an invalid type', async () => {
        await findInternalCaseUserActions({
          caseID: '123',
          supertest,
          options: {
            sortOrder: 'asc',
            // @ts-expect-error using an invalid filter type
            types: ['invalid-type'],
          },
          expectedHttpCode: 400,
        });
      });

      it('returns an empty array when the user action type does not exist', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.comment],
          },
        });

        expect(response.userActions.length).to.be(0);
        expect(response.latestAttachments.length).to.be(0);
      });

      it('retrieves only the comment user actions', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await createComment({
          supertest,
          caseId: theCase.id,
          params: postCommentUserReq,
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.comment],
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(1);

        const commentUserAction = response.userActions[0];
        expect(commentUserAction.type).to.eql('comment');
        expect(commentUserAction.action).to.eql('create');
        expect(commentUserAction.payload).to.eql({
          comment: postCommentUserReq,
        });
      });

      it('retrieves only the connector user actions', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await updateCase({
          params: {
            cases: [
              {
                id: theCase.id,
                version: theCase.version,
                connector: {
                  id: 'my-jira',
                  name: 'jira',
                  type: ConnectorTypes.jira,
                  fields: {
                    issueType: 'task',
                    parent: null,
                    priority: null,
                  },
                },
              },
            ],
          },
          supertest,
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.connector],
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(0);

        const updateConnectorUserAction = response.userActions[0];
        expect(updateConnectorUserAction.type).to.eql('connector');
        expect(updateConnectorUserAction.action).to.eql('update');
        expect(updateConnectorUserAction.payload).to.eql({
          connector: {
            id: 'my-jira',
            name: 'jira',
            type: ConnectorTypes.jira,
            fields: {
              issueType: 'task',
              parent: null,
              priority: null,
            },
          },
        });
      });

      it('retrieves only the description user actions', async () => {
        const newDesc = 'Such a great description';
        const theCase = await createCase(supertest, getPostCaseRequest());

        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: theCase.id,
                version: theCase.version,
                description: newDesc,
              },
            ],
          },
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.description],
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(0);

        const descriptionUserAction = response.userActions[0];

        expect(descriptionUserAction.type).to.eql('description');
        expect(descriptionUserAction.action).to.eql('update');
        expect(descriptionUserAction.payload).to.eql({ description: newDesc });
      });

      it('retrieves only the tags user actions', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: theCase.id,
                version: theCase.version,
                tags: ['cool', 'neat'],
              },
            ],
          },
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.tags],
          },
        });

        expect(response.userActions.length).to.be(2);
        expect(response.latestAttachments.length).to.be(0);

        const addTagsUserAction = response.userActions[0];
        const deleteTagsUserAction = response.userActions[1];

        expect(addTagsUserAction.type).to.eql('tags');
        expect(addTagsUserAction.action).to.eql('add');
        expect(addTagsUserAction.payload).to.eql({ tags: ['cool', 'neat'] });
        expect(deleteTagsUserAction.type).to.eql('tags');
        expect(deleteTagsUserAction.action).to.eql('delete');
        expect(deleteTagsUserAction.payload).to.eql({ tags: ['defacement'] });
      });

      it('retrieves only the title user actions', async () => {
        const newTitle = 'Such a great title';
        const theCase = await createCase(supertest, getPostCaseRequest());

        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: theCase.id,
                version: theCase.version,
                title: newTitle,
              },
            ],
          },
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.title],
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(0);

        const descriptionUserAction = response.userActions[0];

        expect(descriptionUserAction.type).to.eql('title');
        expect(descriptionUserAction.action).to.eql('update');
        expect(descriptionUserAction.payload).to.eql({ title: newTitle });
      });

      it('retrieves only the status user actions', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: theCase.id,
                version: theCase.version,
                status: CaseStatuses.closed,
              },
            ],
          },
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.status],
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(0);

        const statusUserAction = response.userActions[0];

        expect(statusUserAction.type).to.eql('status');
        expect(statusUserAction.action).to.eql('update');
        expect(statusUserAction.payload).to.eql({ status: 'closed' });
      });

      it('retrieves only the settings user actions', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: theCase.id,
                version: theCase.version,
                settings: { syncAlerts: false, extractObservables: false },
              },
            ],
          },
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.settings],
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(0);

        const settingsUserAction = response.userActions[0];

        expect(settingsUserAction.type).to.eql('settings');
        expect(settingsUserAction.action).to.eql('update');
        expect(settingsUserAction.payload).to.eql({
          settings: { syncAlerts: false, extractObservables: false },
        });
      });

      it('retrieves only the severity user actions', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: theCase.id,
                version: theCase.version,
                severity: CaseSeverity.HIGH,
              },
            ],
          },
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.severity],
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(0);

        const severityUserAction = response.userActions[0];

        expect(severityUserAction.type).to.eql('severity');
        expect(severityUserAction.action).to.eql('update');
        expect(severityUserAction.payload).to.eql({ severity: CaseSeverity.HIGH });
      });

      it('retrieves only the create_case user actions', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: [UserActionTypes.create_case],
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(0);

        const createCaseUserAction = response.userActions[0];

        expect(createCaseUserAction.type).to.eql('create_case');
        expect(createCaseUserAction.action).to.eql('create');
      });

      it('retrieves any non user comment user actions using the action filter', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        const updatedCase = await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [
            postCommentUserReq,
            postExternalReferenceESReq,
            persistableStateAttachment,
            postCommentActionsReq,
          ],
        });

        await updateCase({
          supertest,
          params: {
            cases: [
              {
                id: updatedCase.id,
                version: updatedCase.version,
                severity: CaseSeverity.HIGH,
              },
            ],
          },
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: ['action'],
          },
        });

        expect(response.userActions.length).to.be(5);
        expect(response.latestAttachments.length).to.be(3);

        const createCaseUserAction = response.userActions[0];

        expect(createCaseUserAction.type).to.eql('create_case');
        expect(createCaseUserAction.action).to.eql('create');

        const externalRef = response.userActions[1] as CommentUserAction;

        expect(externalRef.type).to.eql('comment');
        expect(externalRef.payload.comment.type).to.eql('externalReference');
        expect(externalRef.action).to.eql('create');

        const persistableState = response.userActions[2] as CommentUserAction;

        expect(persistableState.type).to.eql('comment');
        expect(persistableState.payload.comment.type).to.eql('persistableState');
        expect(persistableState.action).to.eql('create');

        const actions = response.userActions[3] as CommentUserAction;

        expect(actions.type).to.eql('comment');
        expect(actions.payload.comment.type).to.eql('actions');
        expect(actions.action).to.eql('create');

        expect(response.userActions[4].type).to.eql('severity');
        expect(response.userActions[4].action).to.eql('update');
      });

      it('retrieves only alert user actions', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [postCommentUserReq, postCommentAlertReq],
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: ['alert'],
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(1);

        const alertUserAction = response.userActions[0] as CommentUserAction;

        expect(alertUserAction.type).to.eql('comment');
        expect(alertUserAction.action).to.eql('create');
        expect(alertUserAction.payload.comment.type).to.eql('alert');
      });

      it('retrieves only user comment user actions', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [postCommentUserReq, postCommentActionsReq, postCommentAlertReq],
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: ['user'],
          },
        });

        expect(response.userActions.length).to.be(1);
        expect(response.latestAttachments.length).to.be(1);

        const userCommentUserAction = response.userActions[0] as CommentUserAction;

        expect(userCommentUserAction.type).to.eql('comment');
        expect(userCommentUserAction.action).to.eql('create');
        expect(userCommentUserAction.payload.comment.type).to.eql('user');
      });

      it('retrieves attachment user actions', async () => {
        const theCase = await createCase(supertest, getPostCaseRequest());

        await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [
            // This one should not show up in the filter for attachments
            postCommentUserReq,
            postExternalReferenceESReq,
            persistableStateAttachment,
            // This one should not show up in the filter for attachments
            postCommentActionsReq,
            // This one should not show up in the filter for attachments
            postCommentAlertReq,
          ],
        });

        const response = await findInternalCaseUserActions({
          caseID: theCase.id,
          supertest,
          options: {
            sortOrder: 'asc',
            types: ['attachment'],
          },
        });

        expect(response.userActions.length).to.be(2);
        expect(response.latestAttachments.length).to.be(2);

        const externalRefUserAction = response.userActions[0] as CommentUserAction;

        expect(externalRefUserAction.type).to.eql('comment');
        expect(externalRefUserAction.action).to.eql('create');
        expect(externalRefUserAction.payload.comment.type).to.eql('externalReference');

        const peristableStateUserAction = response.userActions[1] as CommentUserAction;

        expect(peristableStateUserAction.type).to.eql('comment');
        expect(peristableStateUserAction.action).to.eql('create');
        expect(peristableStateUserAction.payload.comment.type).to.eql('persistableState');
      });

      describe('filtering on multiple types', () => {
        it('retrieves the create_case and comment user actions', async () => {
          const theCase = await createCase(supertest, getPostCaseRequest());

          await createComment({
            supertest,
            caseId: theCase.id,
            params: postCommentUserReq,
          });

          const response = await findInternalCaseUserActions({
            caseID: theCase.id,
            supertest,
            options: {
              sortOrder: 'asc',
              types: [UserActionTypes.create_case, UserActionTypes.comment],
            },
          });

          expect(response.userActions.length).to.be(2);
          expect(response.latestAttachments.length).to.be(1);

          const createCaseUserAction = response.userActions[0];
          expect(createCaseUserAction.type).to.eql('create_case');
          expect(createCaseUserAction.action).to.eql('create');

          const commentUserAction = response.userActions[1];
          expect(commentUserAction.type).to.eql('comment');
          expect(commentUserAction.action).to.eql('create');
        });

        it('retrieves the create_case user action when there are not valid comment user actions', async () => {
          const theCase = await createCase(supertest, getPostCaseRequest());

          const response = await findInternalCaseUserActions({
            caseID: theCase.id,
            supertest,
            options: {
              sortOrder: 'asc',
              types: [UserActionTypes.create_case, UserActionTypes.comment],
            },
          });

          expect(response.userActions.length).to.be(1);
          expect(response.latestAttachments.length).to.be(0);

          const createCaseUserAction = response.userActions[0];
          expect(createCaseUserAction.type).to.eql('create_case');
          expect(createCaseUserAction.action).to.eql('create');
        });
      });

      describe('author filter', () => {
        it('filters user actions by author username', async () => {
          const theCase = await createCase(supertest, getPostCaseRequest());

          await createComment({
            supertest,
            caseId: theCase.id,
            params: postCommentUserReq,
          });

          const response = await findInternalCaseUserActions({
            caseID: theCase.id,
            supertest,
            options: {
              author: 'elastic',
            },
          });

          for (const userAction of response.userActions) {
            expect(userAction.created_by.username).to.be('elastic');
          }
        });

        it('returns empty results when author does not match', async () => {
          const theCase = await createCase(supertest, getPostCaseRequest());

          const response = await findInternalCaseUserActions({
            caseID: theCase.id,
            supertest,
            options: {
              author: 'nonexistent_user',
            },
          });

          expect(response.total).to.be(0);
          expect(response.userActions.length).to.be(0);
        });
      });

      describe('search filter', () => {
        it('filters user actions by search term in comment payload', async () => {
          const theCase = await createCase(supertest, getPostCaseRequest());

          await createComment({
            supertest,
            caseId: theCase.id,
            params: postCommentUserReq,
          });

          const response = await findInternalCaseUserActions({
            caseID: theCase.id,
            supertest,
            options: {
              search: 'cool comment',
            },
          });

          expect(response.total).to.be(1);
          expect(response.userActions[0].type).to.eql('comment');
        });

        it('returns empty results when search term does not match', async () => {
          const theCase = await createCase(supertest, getPostCaseRequest());

          await createComment({
            supertest,
            caseId: theCase.id,
            params: postCommentUserReq,
          });

          const response = await findInternalCaseUserActions({
            caseID: theCase.id,
            supertest,
            options: {
              search: 'xyz_no_match_term',
            },
          });

          expect(response.total).to.be(0);
          expect(response.userActions.length).to.be(0);
        });

        it('search is case-insensitive', async () => {
          const theCase = await createCase(supertest, getPostCaseRequest());

          await createComment({
            supertest,
            caseId: theCase.id,
            params: postCommentUserReq,
          });

          const response = await findInternalCaseUserActions({
            caseID: theCase.id,
            supertest,
            options: {
              search: 'COOL COMMENT',
            },
          });

          expect(response.total).to.be(1);
        });

        it('paginates search results correctly', async () => {
          const theCase = await createCase(supertest, getPostCaseRequest());

          const updatedCase = await createComment({
            supertest,
            caseId: theCase.id,
            params: postCommentUserReq,
          });

          await updateCase({
            supertest,
            params: {
              cases: [
                {
                  id: theCase.id,
                  version: updatedCase.version,
                  title: 'This is a cool title',
                },
              ],
            },
          });

          const response = await findInternalCaseUserActions({
            caseID: theCase.id,
            supertest,
            options: {
              search: 'cool',
              page: 1,
              perPage: 1,
            },
          });

          expect(response.perPage).to.be(1);
          expect(response.page).to.be(1);
          expect(response.total).to.be(2);
          expect(response.userActions.length).to.be(1);
        });

        it('combines search and author filters', async () => {
          const theCase = await createCase(supertest, getPostCaseRequest());

          await createComment({
            supertest,
            caseId: theCase.id,
            params: postCommentUserReq,
          });

          const response = await findInternalCaseUserActions({
            caseID: theCase.id,
            supertest,
            options: {
              search: 'cool comment',
              author: 'elastic',
            },
          });

          expect(response.total).to.be(1);
          expect(response.userActions[0].type).to.eql('comment');
          expect(response.userActions[0].created_by.username).to.be('elastic');
        });
      });

      describe('rbac', () => {
        const supertestWithoutAuth = getService('supertestWithoutAuth');

        let secCase: Case;
        let obsCase: Case;
        let secCaseSpace2: Case;

        beforeEach(async () => {
          [secCase, obsCase, secCaseSpace2] = await Promise.all([
            createCase(
              supertestWithoutAuth,
              getPostCaseRequest({ owner: 'securitySolutionFixture' }),
              200,
              {
                user: secOnly,
                space: 'space1',
              }
            ),
            createCase(
              supertestWithoutAuth,
              getPostCaseRequest({ owner: 'observabilityFixture' }),
              200,
              {
                user: obsOnly,
                space: 'space1',
              }
            ),
            createCase(
              supertestWithoutAuth,
              getPostCaseRequest({ owner: 'securitySolutionFixture' }),
              200,
              {
                user: superUser,
                space: 'space2',
              }
            ),
          ]);
        });

        it('should return with the correct status code when executing with various users', async () => {
          for (const scenario of [
            {
              user: globalRead,
              id: secCase.id,
              space: 'space1',
            },
            {
              user: globalRead,
              id: obsCase.id,
              space: 'space1',
            },
            {
              user: superUser,
              id: secCase.id,
              space: 'space1',
            },
            {
              user: superUser,
              id: obsCase.id,
              space: 'space1',
            },
            {
              user: secOnlyRead,
              id: secCase.id,
              space: 'space1',
            },
            {
              user: obsOnlyRead,
              id: obsCase.id,
              space: 'space1',
            },
          ]) {
            const res = await findInternalCaseUserActions({
              caseID: scenario.id,
              supertest: supertestWithoutAuth,
              options: {
                sortOrder: 'asc',
                types: [UserActionTypes.create_case],
              },
              auth: { user: scenario.user, space: scenario.space },
            });

            expect(res.userActions.length).to.be(1);
          }
        });

        it('should fail to find user actions for a case that the user is not authorized for', async () => {
          for (const scenario of [
            {
              user: secOnlyRead,
              id: obsCase.id,
              space: 'space1',
              expectedCode: 403,
            },
            {
              user: obsOnlyRead,
              id: secCase.id,
              space: 'space1',
              expectedCode: 403,
            },
            {
              user: noKibanaPrivileges,
              id: secCase.id,
              space: 'space1',
              expectedCode: 403,
            },
            {
              user: secOnlyRead,
              id: secCaseSpace2.id,
              space: 'space2',
              expectedCode: 403,
            },
          ]) {
            await findInternalCaseUserActions({
              caseID: scenario.id,
              supertest: supertestWithoutAuth,
              expectedHttpCode: scenario.expectedCode,
              options: {
                sortOrder: 'asc',
                types: [UserActionTypes.create_case],
              },
              auth: { user: scenario.user, space: scenario.space },
            });
          }
        });
      });
    });
  });
};
