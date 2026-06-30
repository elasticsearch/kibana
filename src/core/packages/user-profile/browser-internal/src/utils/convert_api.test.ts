/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { of } from 'rxjs';
import type { CoreUserProfileDelegateContract } from '@kbn/core-user-profile-browser';
import type { InternalUserProfileServiceStart } from '../internal_contracts';
import { convertUserProfileAPI } from './convert_api';

describe('convertUserProfileAPI', () => {
  let source: jest.Mocked<CoreUserProfileDelegateContract>;
  let output: InternalUserProfileServiceStart;

  beforeEach(() => {
    source = {
      userProfile$: of(null),
      enabled$: of(false),
      dataUpdates$: of({}),
      getCurrent: jest.fn(),
      bulkGet: jest.fn(),
      suggest: jest.fn(),
      update: jest.fn(),
      partialUpdate: jest.fn(),
    };
    output = convertUserProfileAPI(source);
  });

  describe('getUserProfile$', () => {
    it('returns the observable from the source', () => {
      expect(output.getUserProfile$()).toBe(source.userProfile$);
    });
  });

  describe('getEnabled$', () => {
    it('returns the observable from the source', () => {
      expect(output.getEnabled$()).toBe(source.enabled$);
    });
  });

  describe('getCurrent', () => {
    it('calls the API from the source with the correct parameters', () => {
      output.getCurrent();
      expect(source.getCurrent).toHaveBeenCalledTimes(1);
      expect(source.getCurrent).toHaveBeenCalledWith();
    });
  });

  describe('bulkGet', () => {
    it('calls the API from the source with the correct parameters', () => {
      const params = { uids: new Set<string>(['fake-uid-1', 'fake-uid-2', 'fake-uid-3']) };
      output.bulkGet(params);
      expect(source.bulkGet).toHaveBeenCalledTimes(1);
      expect(source.bulkGet).toHaveBeenCalledWith(params);
    });
  });

  describe('suggest', () => {
    it('calls the API from the source with the correct parameters', () => {
      output.suggest('path', { name: 'foo' });
      expect(source.suggest).toHaveBeenCalledTimes(1);
      expect(source.suggest).toHaveBeenCalledWith('path', { name: 'foo' });
    });
  });

  describe('update', () => {
    it('calls the API from the source with the correct parameters', () => {
      output.update({ foo: 'dolly' });
      expect(source.update).toHaveBeenCalledTimes(1);
      expect(source.update).toHaveBeenCalledWith({ foo: 'dolly' });
    });
  });

  describe('partialUpdate', () => {
    it('calls the API from the source with the correct parameters', () => {
      output.partialUpdate({ foo: 'dolly' });
      expect(source.partialUpdate).toHaveBeenCalledTimes(1);
      expect(source.partialUpdate).toHaveBeenCalledWith({ foo: 'dolly' });
    });
  });
});
