/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PathReporter } from 'io-ts/lib/PathReporter';
import {
  MAX_BULK_CREATE_ATTACHMENTS,
  MAX_BULK_DELETE_ATTACHMENTS,
  MAX_COMMENT_LENGTH,
  MAX_FILENAME_LENGTH,
} from '../../../constants';
import { AttachmentType } from '../../domain/attachment/v1';
import {
  AttachmentPatchRequestRt,
  AttachmentRequestRt,
  AttachmentsFindResponseRt,
  BulkCreateAttachmentsRequestRt,
  BulkDeleteAttachmentsRequestRt,
  BulkDeleteFileAttachmentsRequestRt,
  BulkGetAttachmentsRequestRt,
  BulkGetAttachmentsResponseRt,
  FindAttachmentsQueryParamsRt,
  PostFileAttachmentRequestRt,
} from './v1';
import {
  AttachmentPatchRequestSchema,
  AttachmentRequestSchema,
  AttachmentsFindResponseSchema,
  BulkCreateAttachmentsRequestSchema,
  BulkDeleteAttachmentsRequestSchema,
  BulkDeleteFileAttachmentsRequestSchema,
  BulkGetAttachmentsRequestSchema,
  BulkGetAttachmentsResponseSchema,
  FindAttachmentsQueryParamsSchema,
  PostFileAttachmentRequestSchema,
} from '../../api_zod/attachment/v1';

describe('Attachments', () => {
  describe('BulkDeleteFileAttachmentsRequestRt', () => {
    it('has expected attributes in request', () => {
      const query = BulkDeleteFileAttachmentsRequestRt.decode({ ids: ['abc', 'xyz'] });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: { ids: ['abc', 'xyz'] },
      });
    });

    it('removes foo:bar attributes from request', () => {
      const query = BulkDeleteFileAttachmentsRequestRt.decode({
        ids: ['abc', 'xyz'],
        foo: 'bar',
      });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: { ids: ['abc', 'xyz'] },
      });
    });

    it('zod: has expected attributes in request', () => {
      const result = BulkDeleteFileAttachmentsRequestSchema.safeParse({ ids: ['abc', 'xyz'] });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual({ ids: ['abc', 'xyz'] });
    });

    it('zod: strips unknown fields', () => {
      const result = BulkDeleteFileAttachmentsRequestSchema.safeParse({
        ids: ['abc', 'xyz'],
        foo: 'bar',
      });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual({ ids: ['abc', 'xyz'] });
    });
  });

  describe('BulkDeleteAttachmentsRequestRt', () => {
    it('has expected attributes in request', () => {
      const query = BulkDeleteAttachmentsRequestRt.decode({ ids: ['abc', 'xyz'] });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: { ids: ['abc', 'xyz'] },
      });
    });

    it('removes foo:bar attributes from request', () => {
      const query = BulkDeleteAttachmentsRequestRt.decode({ ids: ['abc', 'xyz'], foo: 'bar' });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: { ids: ['abc', 'xyz'] },
      });
    });

    it(`fails with more than ${MAX_BULK_DELETE_ATTACHMENTS} ids`, () => {
      const ids = new Array(MAX_BULK_DELETE_ATTACHMENTS + 1).fill('id');
      const query = BulkDeleteAttachmentsRequestRt.decode({ ids });

      expect(query._tag).toBe('Left');
    });

    it('fails with an empty array of ids', () => {
      const query = BulkDeleteAttachmentsRequestRt.decode({ ids: [] });

      expect(query._tag).toBe('Left');
    });

    it('zod: has expected attributes in request', () => {
      const result = BulkDeleteAttachmentsRequestSchema.safeParse({ ids: ['abc', 'xyz'] });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual({ ids: ['abc', 'xyz'] });
    });

    it(`zod: fails with more than ${MAX_BULK_DELETE_ATTACHMENTS} ids`, () => {
      const ids = new Array(MAX_BULK_DELETE_ATTACHMENTS + 1).fill('id');
      const result = BulkDeleteAttachmentsRequestSchema.safeParse({ ids });
      expect(result.success).toBe(false);
    });
  });

  describe('AttachmentRequestRt', () => {
    const defaultRequest = {
      comment: 'Solve this fast!',
      type: AttachmentType.user,
      owner: 'cases',
    };

    it('has expected attributes in request', () => {
      const query = AttachmentRequestRt.decode(defaultRequest);

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('removes foo:bar attributes from request', () => {
      const query = AttachmentRequestRt.decode({ ...defaultRequest, foo: 'bar' });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('zod: has expected attributes in request', () => {
      const result = AttachmentRequestSchema.safeParse(defaultRequest);
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });

    it('zod: strips unknown fields', () => {
      const result = AttachmentRequestSchema.safeParse({ ...defaultRequest, foo: 'bar' });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });

    describe('errors', () => {
      describe('commentType: user', () => {
        it('throws error when comment is too long', () => {
          const longComment = 'x'.repeat(MAX_COMMENT_LENGTH + 1);

          expect(
            PathReporter.report(
              AttachmentRequestRt.decode({ ...defaultRequest, comment: longComment })
            )
          ).toContain('The length of the comment is too long. The maximum length is 30000.');
        });

        it('throws error when comment is empty', () => {
          expect(
            PathReporter.report(AttachmentRequestRt.decode({ ...defaultRequest, comment: '' }))
          ).toContain('The comment field cannot be an empty string.');
        });

        it('throws error when comment string of empty characters', () => {
          expect(
            PathReporter.report(AttachmentRequestRt.decode({ ...defaultRequest, comment: '   ' }))
          ).toContain('The comment field cannot be an empty string.');
        });
      });

      describe('commentType: action', () => {
        const request = {
          type: AttachmentType.actions,
          actions: {
            targets: [
              {
                hostname: 'host1',
                endpointId: '001',
              },
            ],
            type: 'isolate',
          },
          owner: 'cases',
        };

        it('throws error when comment is too long', () => {
          const longComment = 'x'.repeat(MAX_COMMENT_LENGTH + 1);

          expect(
            PathReporter.report(AttachmentRequestRt.decode({ ...request, comment: longComment }))
          ).toContain('The length of the comment is too long. The maximum length is 30000.');
        });

        it('throws error when comment is empty', () => {
          expect(
            PathReporter.report(AttachmentRequestRt.decode({ ...request, comment: '' }))
          ).toContain('The comment field cannot be an empty string.');
        });

        it('throws error when comment string of empty characters', () => {
          expect(
            PathReporter.report(AttachmentRequestRt.decode({ ...request, comment: '   ' }))
          ).toContain('The comment field cannot be an empty string.');
        });
      });
    });
  });

  describe('AttachmentPatchRequestRt', () => {
    const defaultRequest = {
      alertId: 'alert-id-1',
      index: 'alert-index-1',
      type: AttachmentType.alert,
      id: 'alert-comment-id',
      owner: 'cases',
      rule: {
        id: 'rule-id-1',
        name: 'Awesome rule',
      },
      version: 'WzQ3LDFc',
    };
    it('has expected attributes in request', () => {
      const query = AttachmentPatchRequestRt.decode(defaultRequest);

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('removes foo:bar attributes from request', () => {
      const query = AttachmentPatchRequestRt.decode({ ...defaultRequest, foo: 'bar' });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('zod: has expected attributes in request', () => {
      const result = AttachmentPatchRequestSchema.safeParse(defaultRequest);
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });

    it('zod: strips unknown fields', () => {
      const result = AttachmentPatchRequestSchema.safeParse({ ...defaultRequest, foo: 'bar' });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });
  });

  describe('AttachmentsFindResponseRt', () => {
    const defaultRequest = {
      comments: [
        {
          comment: 'Solve this fast!',
          type: AttachmentType.user,
          owner: 'cases',
          created_at: '2020-02-19T23:06:33.798Z',
          created_by: {
            full_name: 'Leslie Knope',
            username: 'lknope',
            email: 'leslie.knope@elastic.co',
          },
          pushed_at: null,
          pushed_by: null,
          updated_at: null,
          updated_by: null,
          id: 'basic-comment-id',
          version: 'WzQ3LDFc',
        },
      ],
      page: 1,
      per_page: 10,
      total: 1,
    };
    it('has expected attributes in request', () => {
      const query = AttachmentsFindResponseRt.decode(defaultRequest);

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('removes foo:bar attributes from request', () => {
      const query = AttachmentsFindResponseRt.decode({ ...defaultRequest, foo: 'bar' });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('removes foo:bar attributes from comments', () => {
      const query = AttachmentsFindResponseRt.decode({
        ...defaultRequest,
        comments: [{ ...defaultRequest.comments[0], foo: 'bar' }],
      });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('zod: has expected attributes in request', () => {
      const result = AttachmentsFindResponseSchema.safeParse(defaultRequest);
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });

    it('zod: strips unknown fields', () => {
      const result = AttachmentsFindResponseSchema.safeParse({ ...defaultRequest, foo: 'bar' });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });
  });

  describe('FindAttachmentsQueryParamsRt', () => {
    const defaultRequest = {
      page: 1,
      perPage: 10,
      sortOrder: 'asc',
    };

    it('has expected attributes in request', () => {
      const query = FindAttachmentsQueryParamsRt.decode(defaultRequest);

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('removes foo:bar attributes from request', () => {
      const query = FindAttachmentsQueryParamsRt.decode({ ...defaultRequest, foo: 'bar' });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('zod: has expected attributes in request', () => {
      const result = FindAttachmentsQueryParamsSchema.safeParse(defaultRequest);
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });

    it('zod: strips unknown fields', () => {
      const result = FindAttachmentsQueryParamsSchema.safeParse({ ...defaultRequest, foo: 'bar' });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });
  });

  describe('BulkCreateAttachmentsRequestRt', () => {
    const defaultRequest = [
      {
        comment: 'Solve this fast!',
        type: AttachmentType.user,
        owner: 'cases',
      },
    ];

    it('has expected attributes in request', () => {
      const query = BulkCreateAttachmentsRequestRt.decode(defaultRequest);

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('removes foo:bar attributes from request', () => {
      const query = BulkCreateAttachmentsRequestRt.decode([
        { comment: 'Solve this fast!', type: AttachmentType.user, owner: 'cases', foo: 'bar' },
      ]);

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('zod: has expected attributes in request', () => {
      const result = BulkCreateAttachmentsRequestSchema.safeParse(defaultRequest);
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });

    it('zod: strips unknown fields', () => {
      const result = BulkCreateAttachmentsRequestSchema.safeParse([
        { comment: 'Solve this fast!', type: AttachmentType.user, owner: 'cases', foo: 'bar' },
      ]);
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });

    describe('errors', () => {
      it(`throws error when attachments are more than ${MAX_BULK_CREATE_ATTACHMENTS}`, () => {
        const comment = {
          comment: 'Solve this fast!',
          type: AttachmentType.user,
          owner: 'cases',
        };
        const attachments = Array(MAX_BULK_CREATE_ATTACHMENTS + 1).fill(comment);

        expect(PathReporter.report(BulkCreateAttachmentsRequestRt.decode(attachments))).toContain(
          `The length of the field attachments is too long. Array must be of length <= ${MAX_BULK_CREATE_ATTACHMENTS}.`
        );
      });

      it(`no errors when empty array of attachments`, () => {
        expect(PathReporter.report(BulkCreateAttachmentsRequestRt.decode([]))).toStrictEqual([
          'No errors!',
        ]);
      });
    });
  });

  describe('BulkGetAttachmentsRequestRt', () => {
    it('has expected attributes in request', () => {
      const query = BulkGetAttachmentsRequestRt.decode({ ids: ['abc', 'xyz'] });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: { ids: ['abc', 'xyz'] },
      });
    });

    it('removes foo:bar attributes from request', () => {
      const query = BulkGetAttachmentsRequestRt.decode({ ids: ['abc', 'xyz'], foo: 'bar' });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: { ids: ['abc', 'xyz'] },
      });
    });

    it('zod: has expected attributes in request', () => {
      const result = BulkGetAttachmentsRequestSchema.safeParse({ ids: ['abc', 'xyz'] });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual({ ids: ['abc', 'xyz'] });
    });

    it('zod: strips unknown fields', () => {
      const result = BulkGetAttachmentsRequestSchema.safeParse({
        ids: ['abc', 'xyz'],
        foo: 'bar',
      });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual({ ids: ['abc', 'xyz'] });
    });
  });

  describe('BulkGetAttachmentsResponseRt', () => {
    const defaultRequest = {
      attachments: [
        {
          comment: 'Solve this fast!',
          type: AttachmentType.user,
          owner: 'cases',
          id: 'basic-comment-id',
          version: 'WzQ3LDFc',
          created_at: '2020-02-19T23:06:33.798Z',
          created_by: {
            full_name: 'Leslie Knope',
            username: 'lknope',
            email: 'leslie.knope@elastic.co',
          },
          pushed_at: null,
          pushed_by: null,
          updated_at: null,
          updated_by: null,
        },
      ],
      errors: [
        {
          error: 'error',
          message: 'not found',
          status: 404,
          savedObjectId: 'abc',
        },
      ],
    };

    it('has expected attributes in request', () => {
      const query = BulkGetAttachmentsResponseRt.decode(defaultRequest);

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('removes foo:bar attributes from request', () => {
      const query = BulkGetAttachmentsResponseRt.decode({ ...defaultRequest, foo: 'bar' });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('removes foo:bar attributes from attachments', () => {
      const query = BulkGetAttachmentsResponseRt.decode({
        ...defaultRequest,
        attachments: [{ ...defaultRequest.attachments[0], foo: 'bar' }],
      });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('removes foo:bar attributes from errors', () => {
      const query = BulkGetAttachmentsResponseRt.decode({
        ...defaultRequest,
        errors: [{ ...defaultRequest.errors[0], foo: 'bar' }],
      });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('zod: has expected attributes in request', () => {
      const result = BulkGetAttachmentsResponseSchema.safeParse(defaultRequest);
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });

    it('zod: strips unknown fields', () => {
      const result = BulkGetAttachmentsResponseSchema.safeParse({ ...defaultRequest, foo: 'bar' });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });
  });

  describe('PostFileAttachmentRequestRt', () => {
    const defaultRequest = {
      file: 'Solve this fast!',
      filename: 'filename',
    };

    it('has the expected attributes in request', () => {
      const query = PostFileAttachmentRequestRt.decode(defaultRequest);

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('removes foo:bar attributes from request', () => {
      const query = PostFileAttachmentRequestRt.decode({ ...defaultRequest, foo: 'bar' });

      expect(query).toStrictEqual({
        _tag: 'Right',
        right: defaultRequest,
      });
    });

    it('zod: has expected attributes in request', () => {
      const result = PostFileAttachmentRequestSchema.safeParse(defaultRequest);
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });

    it('zod: strips unknown fields', () => {
      const result = PostFileAttachmentRequestSchema.safeParse({ ...defaultRequest, foo: 'bar' });
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual(defaultRequest);
    });

    describe('errors', () => {
      it('throws an error when the filename is too long', () => {
        const longFilename = 'x'.repeat(MAX_FILENAME_LENGTH + 1);

        expect(
          PathReporter.report(
            PostFileAttachmentRequestRt.decode({ ...defaultRequest, filename: longFilename })
          )
        ).toContain('The length of the filename is too long. The maximum length is 160.');
      });

      it('throws an error when the filename is too small', () => {
        expect(
          PathReporter.report(
            PostFileAttachmentRequestRt.decode({ ...defaultRequest, filename: '' })
          )
        ).toContain('The filename field cannot be an empty string.');
      });
    });
  });
});
