/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { MAP_ATTACHMENT_TYPE, MAP_SO_TYPE } from '@kbn/cases-plugin/common/constants/attachments';
import type { BulkCreateAttachmentsRequestV2 } from '@kbn/cases-plugin/common/types/api';
import type { FtrProviderContext } from '../../../common/ftr_provider_context';
import { postCaseReq, postCommentUserReq } from '../../../common/lib/mock';
import {
  bulkCreateAttachments,
  createCase,
  deleteAllCaseItems,
  findCaseUserActions,
} from '../../../common/lib/api';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('Map saved-object attachments', () => {
    const mapPayload = {
      type: MAP_ATTACHMENT_TYPE,
      owner: 'securitySolutionFixture',
      attachmentId: 'map-1',
      metadata: {
        title: 'My map',
        soType: MAP_SO_TYPE,
      },
    };

    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    it('returns a unified-shaped response when the batch contains a map attachment', async () => {
      const postedCase = await createCase(supertest, postCaseReq);
      const updatedCase = await bulkCreateAttachments({
        supertest,
        caseId: postedCase.id,
        params: [mapPayload] as unknown as BulkCreateAttachmentsRequestV2,
      });

      expect(updatedCase.comments?.length).to.be(1);
      const attachment = updatedCase.comments![0] as unknown as {
        type: string;
        attachmentId: string;
        metadata: { title: string; soType: string };
        owner: string;
      };
      expect(attachment.type).to.eql(MAP_ATTACHMENT_TYPE);
      expect(attachment.attachmentId).to.eql('map-1');
      expect(attachment.metadata).to.eql({
        title: 'My map',
        soType: MAP_SO_TYPE,
      });
      expect(attachment.owner).to.eql('securitySolutionFixture');
    });

    it('records a comment user-action when a map attachment is created', async () => {
      const postedCase = await createCase(supertest, postCaseReq);
      await bulkCreateAttachments({
        supertest,
        caseId: postedCase.id,
        params: [mapPayload] as unknown as BulkCreateAttachmentsRequestV2,
      });

      const { userActions } = await findCaseUserActions({ supertest, caseID: postedCase.id });
      // Position 0 is the "create case" action; position 1 is the attachment.
      const attachmentUserAction = userActions[1];
      expect(attachmentUserAction.type).to.eql('comment');
      expect(attachmentUserAction.action).to.eql('create');
    });

    it('returns a unified-shaped response for a mixed batch (user comment + map)', async () => {
      const postedCase = await createCase(supertest, postCaseReq);
      const updatedCase = await bulkCreateAttachments({
        supertest,
        caseId: postedCase.id,
        params: [postCommentUserReq, mapPayload] as unknown as BulkCreateAttachmentsRequestV2,
      });

      expect(updatedCase.comments?.length).to.be(2);
      const mapAttachment = updatedCase.comments!.find(
        (comment) => comment.type === MAP_ATTACHMENT_TYPE
      ) as unknown as { attachmentId: string };
      expect(mapAttachment).to.be.ok();
      expect(mapAttachment.attachmentId).to.eql('map-1');

      const userPartner = updatedCase.comments!.find(
        (comment) => comment.type === 'user' || comment.type === 'comment'
      ) as unknown as { comment?: string; data?: { content?: string } };
      const partnerContent = userPartner.data?.content ?? userPartner.comment;
      expect(partnerContent).to.eql(postCommentUserReq.comment);
    });
  });
};
