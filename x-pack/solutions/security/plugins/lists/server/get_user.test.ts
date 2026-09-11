/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { securityServiceMock } from '@kbn/core/server/mocks';
import type { SecurityRequestHandlerContext } from '@kbn/core-security-server';

import { getUser, getUserDisplayName } from './get_user';

describe('get_user', () => {
  let security: SecurityRequestHandlerContext;

  beforeEach(() => {
    jest.clearAllMocks();
    security = securityServiceMock.createRequestHandlerContext();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('it returns "bob" as the user given a security request with "bob"', () => {
    security.authc.getCurrentUser = jest.fn().mockReturnValue({ username: 'bob' });
    const user = getUser({ security });
    expect(user).toEqual('bob');
  });

  test('it returns "alice" as the user given a security request with "alice"', () => {
    security.authc.getCurrentUser = jest.fn().mockReturnValue({ username: 'alice' });
    const user = getUser({ security });
    expect(user).toEqual('alice');
  });

  test('it returns full name before username as the display name', () => {
    security.authc.getCurrentUser = jest.fn().mockReturnValue({
      email: 'bob@example.com',
      full_name: 'Bob Smith',
      username: '2983883891',
    });
    const user = getUserDisplayName({ security });
    expect(user).toEqual('Bob Smith');
  });

  test('it returns email before username as the display name if full name is empty', () => {
    security.authc.getCurrentUser = jest.fn().mockReturnValue({
      email: 'bob@example.com',
      full_name: '',
      username: '2983883891',
    });
    const user = getUserDisplayName({ security });
    expect(user).toEqual('bob@example.com');
  });

  test('it returns "elastic" as the user given null as the current user', () => {
    security.authc.getCurrentUser = jest.fn().mockReturnValue(null);
    const user = getUser({ security });
    expect(user).toEqual('elastic');
  });

  test('it returns "elastic" as the user given undefined as the current user', () => {
    security.authc.getCurrentUser = jest.fn().mockReturnValue(undefined);
    const user = getUser({ security });
    expect(user).toEqual('elastic');
  });

  test('it returns "elastic" as the user given undefined as the plugin', () => {
    security.authc.getCurrentUser = jest.fn().mockReturnValue(undefined);
    const user = getUser({ security });
    expect(user).toEqual('elastic');
  });

  test('it returns "elastic" as the user given null as the plugin', () => {
    security.authc.getCurrentUser = jest.fn().mockReturnValue(undefined);
    const user = getUser({ security });
    expect(user).toEqual('elastic');
  });
});
