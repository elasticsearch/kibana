/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import type { UnifiedReferenceAttachmentPayload } from '@kbn/cases-plugin/common/types/domain';
import { SECURITY_ENTITY_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common/constants';
import type { FtrProviderContext } from '../../../common/ftr_provider_context';
import { getPostCaseRequest, postCommentEntityReq } from '../../../common/lib/mock';
import { deleteAllCaseItems, createCase, createComment } from '../../../common/lib/api';
import {
  superUser,
  secOnly,
  obsOnly,
  secOnlyNoCreateComment,
  secOnlyReadCreateComment,
  secOnlyCreateComment,
} from '../../../common/lib/authentication/users';

export default ({ getService }: FtrProviderContext): void => {
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');

  describe('createComment subprivilege - entities (attachments.enabled=true)', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    describe('entities', () => {
      it('should not attach an entity to the case', async () => {
        const postedCase = await createCase(
          supertestWithoutAuth,
          getPostCaseRequest({ owner: 'securitySolutionFixture' }),
          200,
          {
            user: superUser,
            space: 'space1',
          }
        );

        await createComment({
          supertest: supertestWithoutAuth,
          caseId: postedCase.id,
          params: postCommentEntityReq,
          auth: { user: secOnlyNoCreateComment, space: 'space1' },
          expectedHttpCode: 403,
        });
      });

      for (const scenario of [
        { user: secOnlyCreateComment, space: 'space1' },
        { user: secOnlyReadCreateComment, space: 'space1' },
      ]) {
        it(`User ${scenario.user.username} with role(s) ${scenario.user.roles.join()} and space ${
          scenario.space
        } - should attach an entity`, async () => {
          const postedCase = await createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            200,
            {
              user: superUser,
              space: 'space1',
            }
          );

          const caseWithAttachments = await createComment({
            supertest: supertestWithoutAuth,
            caseId: postedCase.id,
            params: postCommentEntityReq,
            auth: scenario,
            expectedHttpCode: 200,
          });

          expect(caseWithAttachments.totalComment).to.be(1);
        });
      }

      describe('owner authorization', () => {
        it('should not attach an entity when the user does not have permissions for that owner', async () => {
          const postedCase = await createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'observabilityFixture' }),
            200,
            { user: obsOnly, space: 'space1' }
          );

          await createComment({
            supertest: supertestWithoutAuth,
            caseId: postedCase.id,
            params: { ...postCommentEntityReq, owner: 'observabilityFixture' },
            auth: { user: secOnly, space: 'space1' },
            expectedHttpCode: 403,
          });
        });

        it('should attach an entity when the user has permissions for that owner', async () => {
          const postedCase = await createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            200,
            { user: secOnly, space: 'space1' }
          );

          await createComment({
            supertest: supertestWithoutAuth,
            caseId: postedCase.id,
            params: postCommentEntityReq,
            auth: { user: secOnly, space: 'space1' },
            expectedHttpCode: 200,
          });
        });
      });

      describe('schema validation', () => {
        it('should reject an entity payload with an extra field without leaking schema internals', async () => {
          const postedCase = await createCase(
            supertestWithoutAuth,
            getPostCaseRequest({ owner: 'securitySolutionFixture' }),
            200,
            {
              user: superUser,
              space: 'space1',
            }
          );

          const response = (await createComment({
            supertest: supertestWithoutAuth,
            caseId: postedCase.id,
            params: {
              ...postCommentEntityReq,
              metadata: {
                ...postCommentEntityReq.metadata,
                extraField: 'not-allowed',
              },
            } as UnifiedReferenceAttachmentPayload,
            auth: { user: superUser, space: 'space1' },
            expectedHttpCode: 400,
          })) as unknown as {
            statusCode: number;
            error: string;
            message: string;
            stack?: string;
          };

          expect(response.statusCode).to.be(400);
          expect(response.error).to.be('Bad Request');
          expect(response.message).to.contain(
            `Invalid attachment payload for type '${SECURITY_ENTITY_ATTACHMENT_TYPE}'`
          );
          expect(response.message).not.to.contain('ZodError');
          expect(response.stack).to.be(undefined);
        });
      });
    });
  });
};
