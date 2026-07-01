/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PathReporter } from 'io-ts/lib/PathReporter';
import { AttachmentType } from '../../domain/attachment/v1';
import { UserActionTypes } from '../../domain/user_action/action/v1';
import { MAX_USER_ACTION_AUTHOR_LENGTH, MAX_USER_ACTION_SEARCH_LENGTH } from '../../../constants';
import {
  type CaseUserActionStatsResponse,
  CaseUserActionStatsResponseRt,
  CaseUserActionStatsRt,
  UserActionFindRequestRt,
  UserActionInternalFindRequestRt,
  UserActionFindResponseRt,
} from './v1';
import {
  CaseUserActionStatsSchema,
  UserActionFindRequestSchema,
  UserActionInternalFindRequestSchema,
  UserActionFindResponseSchema,
} from '../../api_zod/user_action/v1';

describe('User actions APIs', () => {
  describe('Find API', () => {
    describe('UserActionFindRequestRt', () => {
      const defaultRequest = {
        types: [UserActionTypes.comment],
        sortOrder: 'desc',
        page: '1',
        perPage: '10',
      };

      it('has expected attributes in request', () => {
        const query = UserActionFindRequestRt.decode(defaultRequest);

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: {
            ...defaultRequest,
            page: 1,
            perPage: 10,
          },
        });
      });

      it('removes foo:bar attributes from request', () => {
        const query = UserActionFindRequestRt.decode({ ...defaultRequest, foo: 'bar' });

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: {
            ...defaultRequest,
            page: 1,
            perPage: 10,
          },
        });
      });

      it('zod: has expected attributes in request', () => {
        const result = UserActionFindRequestSchema.safeParse(defaultRequest);
        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual({ ...defaultRequest, page: 1, perPage: 10 });
      });

      it('zod: strips unknown fields', () => {
        const result = UserActionFindRequestSchema.safeParse({ ...defaultRequest, foo: 'bar' });
        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual({ ...defaultRequest, page: 1, perPage: 10 });
      });

      it('strips search and author params (internal-only)', () => {
        const query = UserActionFindRequestRt.decode({
          ...defaultRequest,
          search: 'test',
          author: 'elastic',
        });

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: {
            ...defaultRequest,
            page: 1,
            perPage: 10,
          },
        });
      });

      it('zod: strips search and author params (internal-only)', () => {
        const result = UserActionFindRequestSchema.safeParse({
          ...defaultRequest,
          search: 'test',
          author: 'elastic',
        });
        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual({ ...defaultRequest, page: 1, perPage: 10 });
      });
    });

    describe('UserActionInternalFindRequestRt', () => {
      const defaultRequest = {
        types: [UserActionTypes.comment],
        sortOrder: 'desc',
        page: '1',
        perPage: '10',
      };

      it('has expected attributes in request', () => {
        const query = UserActionInternalFindRequestRt.decode({
          ...defaultRequest,
          search: 'test',
          author: 'elastic',
        });

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: {
            ...defaultRequest,
            page: 1,
            perPage: 10,
            search: 'test',
            author: 'elastic',
          },
        });
      });

      it('removes foo:bar attributes from request', () => {
        const query = UserActionInternalFindRequestRt.decode({ ...defaultRequest, foo: 'bar' });

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: {
            ...defaultRequest,
            page: 1,
            perPage: 10,
          },
        });
      });

      it(`throws an error when the search is more than ${MAX_USER_ACTION_SEARCH_LENGTH} characters`, () => {
        const search = 'a'.repeat(MAX_USER_ACTION_SEARCH_LENGTH + 1);

        expect(
          PathReporter.report(UserActionInternalFindRequestRt.decode({ ...defaultRequest, search }))
        ).toContain(
          `The length of the search is too long. The maximum length is ${MAX_USER_ACTION_SEARCH_LENGTH}.`
        );
      });

      it(`throws an error when the author is more than ${MAX_USER_ACTION_AUTHOR_LENGTH} characters`, () => {
        const author = 'a'.repeat(MAX_USER_ACTION_AUTHOR_LENGTH + 1);

        expect(
          PathReporter.report(UserActionInternalFindRequestRt.decode({ ...defaultRequest, author }))
        ).toContain(
          `The length of the author is too long. The maximum length is ${MAX_USER_ACTION_AUTHOR_LENGTH}.`
        );
      });

      it('zod: has expected attributes in request', () => {
        const result = UserActionInternalFindRequestSchema.safeParse({
          ...defaultRequest,
          search: 'test',
          author: 'elastic',
        });
        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual({
          ...defaultRequest,
          page: 1,
          perPage: 10,
          search: 'test',
          author: 'elastic',
        });
      });

      it('zod: throws an error when the search is too long', () => {
        const result = UserActionInternalFindRequestSchema.safeParse({
          ...defaultRequest,
          search: 'a'.repeat(MAX_USER_ACTION_SEARCH_LENGTH + 1),
        });
        expect(result.success).toBe(false);
      });

      it('zod: throws an error when the author is too long', () => {
        const result = UserActionInternalFindRequestSchema.safeParse({
          ...defaultRequest,
          author: 'a'.repeat(MAX_USER_ACTION_AUTHOR_LENGTH + 1),
        });
        expect(result.success).toBe(false);
      });
    });

    describe('UserActionFindResponseRt', () => {
      const defaultRequest = {
        userActions: [
          {
            type: UserActionTypes.comment,
            payload: {
              comment: {
                comment: 'this is a sample comment',
                type: AttachmentType.user,
                owner: 'cases',
              },
            },
            created_at: '2020-02-19T23:06:33.798Z',
            created_by: {
              full_name: 'Leslie Knope',
              username: 'lknope',
              email: 'leslie.knope@elastic.co',
            },
            owner: 'cases',
            action: 'create',
            id: 'basic-comment-id',
            version: 'WzQ3LDFc',
            comment_id: 'basic-comment-id',
          },
        ],
        page: 1,
        perPage: 10,
        total: 20,
      };

      it('has expected attributes in request', () => {
        const query = UserActionFindResponseRt.decode(defaultRequest);

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: defaultRequest,
        });
      });

      it('removes foo:bar attributes from request', () => {
        const query = UserActionFindResponseRt.decode({ ...defaultRequest, foo: 'bar' });

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: defaultRequest,
        });
      });

      it('removes foo:bar attributes from userActions', () => {
        const query = UserActionFindResponseRt.decode({
          ...defaultRequest,
          userActions: [{ ...defaultRequest.userActions[0], foo: 'bar' }],
        });

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: defaultRequest,
        });
      });

      it('zod: has expected attributes in request', () => {
        const result = UserActionFindResponseSchema.safeParse(defaultRequest);
        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual(defaultRequest);
      });

      it('zod: strips unknown fields', () => {
        const result = UserActionFindResponseSchema.safeParse({ ...defaultRequest, foo: 'bar' });
        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual(defaultRequest);
      });
    });
  });

  describe('User actions stats API', () => {
    describe('CaseUserActionStatsResponseRt', () => {
      const defaultRequest: CaseUserActionStatsResponse = {
        total: 15,
        total_deletions: 0,
        total_comments: 10,
        total_comment_deletions: 0,
        total_comment_creations: 0,
        total_hidden_comment_updates: 0,
        total_other_actions: 5,
        total_other_action_deletions: 0,
      };

      it('has expected attributes in request', () => {
        const query = CaseUserActionStatsResponseRt.decode(defaultRequest);

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: defaultRequest,
        });
      });

      it('removes foo:bar attributes from request', () => {
        const query = CaseUserActionStatsResponseRt.decode({ ...defaultRequest, foo: 'bar' });

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: defaultRequest,
        });
      });
    });

    describe('CaseUserActionStatsRt', () => {
      const defaultRequest: CaseUserActionStatsResponse = {
        total: 100,
        total_deletions: 0,
        total_comments: 60,
        total_comment_deletions: 0,
        total_comment_creations: 0,
        total_hidden_comment_updates: 0,
        total_other_actions: 40,
        total_other_action_deletions: 0,
      };

      it('has expected attributes in request', () => {
        const query = CaseUserActionStatsRt.decode(defaultRequest);

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: defaultRequest,
        });
      });

      it('removes foo:bar attributes from request', () => {
        const query = CaseUserActionStatsRt.decode({ ...defaultRequest, foo: 'bar' });

        expect(query).toStrictEqual({
          _tag: 'Right',
          right: defaultRequest,
        });
      });

      it('zod: has expected attributes in request', () => {
        const result = CaseUserActionStatsSchema.safeParse(defaultRequest);
        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual(defaultRequest);
      });

      it('zod: strips unknown fields', () => {
        const result = CaseUserActionStatsSchema.safeParse({ ...defaultRequest, foo: 'bar' });
        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual(defaultRequest);
      });
    });
  });
});
