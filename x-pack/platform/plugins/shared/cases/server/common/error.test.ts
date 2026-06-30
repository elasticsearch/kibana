/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import {
  isSOError,
  isSODecoratedError,
  generateCaseErrorResponse,
  createCaseErrorFromSOError,
} from './error';

describe('common utils', () => {
  describe('isSOError', () => {
    it('returns true if the SO is an error', () => {
      expect(isSOError({ error: { statusCode: '404' } })).toBe(true);
    });

    it('returns false if the SO is not an error', () => {
      expect(isSOError({})).toBe(false);
    });

    it('returns false when the error property is undefined', () => {
      expect(isSOError({ error: undefined })).toBe(false);
    });
  });

  describe('isSODecoratedError', () => {
    it('returns true if the SO error is a decorated error', () => {
      // @ts-expect-error: only the isBoom property is required
      expect(isSODecoratedError({ isBoom: true })).toBe(true);
    });

    it('returns false if the SO is not a decorated error', () => {
      // @ts-expect-error: only the isBoom property is required
      expect(isSODecoratedError({})).toBe(false);
    });
  });

  describe('createCaseErrorFromSOError', () => {
    it('creates a case error from an error', () => {
      const caseError = createCaseErrorFromSOError(
        {
          error: 'My error',
          message: 'not found',
          statusCode: 404,
        },
        'my message'
      );

      expect(caseError.message).toEqual('my message: My error');
      expect(caseError.name).toEqual('CaseError');
      expect(caseError.boomify().output.statusCode).toEqual(404);
    });

    it('creates a case error from a decorated error', () => {
      const caseError = createCaseErrorFromSOError(
        Boom.boomify(new Error('My error'), {
          statusCode: 404,
          message: 'SO not found',
        }),
        'my message'
      );

      expect(caseError.message).toEqual('my message: Not Found');
      expect(caseError.name).toEqual('CaseError');
      expect(caseError.boomify().output.statusCode).toEqual(404);
    });
  });

  describe('generateCaseErrorResponse', () => {
    it('generates a case error response from a decorated error', () => {
      expect(
        generateCaseErrorResponse(
          Boom.boomify(new Error('My error'), {
            statusCode: 404,
            message: 'SO not found',
          })
        )
      ).toEqual({
        error: 'Not Found',
        message: 'SO not found: My error',
        status: 404,
      });
    });

    it('generates a case error response from an SO error', () => {
      expect(
        generateCaseErrorResponse({
          error: 'My error',
          message: 'not found',
          statusCode: 404,
        })
      ).toEqual({
        error: 'My error',
        message: 'not found',
        status: 404,
      });
    });
  });
});
