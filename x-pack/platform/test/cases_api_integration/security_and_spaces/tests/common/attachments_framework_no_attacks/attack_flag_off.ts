/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  SECURITY_ATTACK_ATTACHMENT_TYPE,
  SECURITY_ENTITY_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common/constants';
import type {
  AttachmentRequestV2,
  BulkCreateAttachmentsRequestV2,
} from '@kbn/cases-plugin/common/types/api';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { getPostCaseRequest, postCommentEntityReq } from '../../../../common/lib/mock';
import {
  bulkCreateAttachments,
  createCase,
  createComment,
  deleteAllCaseItems,
  getAllComments,
} from '../../../../common/lib/api';

const OWNER = 'securitySolutionFixture';

const attackAttachment = {
  type: SECURITY_ATTACK_ATTACHMENT_TYPE,
  owner: OWNER,
  attachmentId: 'attack-doc-1',
  metadata: {
    title: 'Credential harvesting followed by lateral movement',
    alertCount: 2,
    index: '.alerts-security.attack.discovery.alerts-default',
  },
};

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('Attack attachments — attackAttachmentsEnabled OFF', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    it('rejects a security.attack attachment as unregistered', async () => {
      const postedCase = await createCase(supertest, getPostCaseRequest({ owner: OWNER }));

      const response = (await createComment({
        supertest,
        caseId: postedCase.id,
        params: attackAttachment as unknown as AttachmentRequestV2,
        expectedHttpCode: 400,
      })) as unknown as { statusCode: number; error: string; message: string };

      expect(response.statusCode).to.be(400);
      expect(response.error).to.be('Bad Request');
      expect(response.message).to.contain(
        `Attachment type ${SECURITY_ATTACK_ATTACHMENT_TYPE} is not registered`
      );

      const comments = await getAllComments({ supertest, caseId: postedCase.id });
      expect(comments.length).to.be(0);
    });

    it('rejects a bulk batch containing a security.attack attachment without persisting any of it', async () => {
      const postedCase = await createCase(supertest, getPostCaseRequest({ owner: OWNER }));

      await bulkCreateAttachments({
        supertest,
        caseId: postedCase.id,
        params: [
          postCommentEntityReq,
          attackAttachment,
        ] as unknown as BulkCreateAttachmentsRequestV2,
        expectedHttpCode: 400,
      });

      const comments = await getAllComments({ supertest, caseId: postedCase.id });
      expect(comments.length).to.be(0);
    });

    it('still accepts other unified attachment types', async () => {
      const postedCase = await createCase(supertest, getPostCaseRequest({ owner: OWNER }));

      const updatedCase = await createComment({
        supertest,
        caseId: postedCase.id,
        params: postCommentEntityReq as unknown as AttachmentRequestV2,
      });

      expect(updatedCase.comments?.length).to.be(1);
      expect(updatedCase.comments![0].type).to.eql(SECURITY_ENTITY_ATTACHMENT_TYPE);
    });
  });
};
