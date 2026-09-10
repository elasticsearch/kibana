/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SamlAuth } from '@kbn/scout';
import { expect } from '@kbn/scout/api';

import { getRoleDescriptor, type RoleName } from './roles';
import { COMMON_HEADERS } from '../constants';

/**
 * A matrix user: either a custom role from the `common/roles.ts` catalog, or a built-in
 * Elasticsearch role (e.g. `machine_learning_admin`) whose descriptor is fetched at
 * runtime. Built-in role fetching is stateful-only (`fetchBuiltInRoleDescriptor` throws
 * on serverless), so it must only be used by `tags.stateful.*` specs.
 */
export type MatrixUser = RoleName | { builtInRole: string };

/**
 * Logs the given user in interactively and returns the request headers combining
 * {@link COMMON_HEADERS} with the session cookie. Cheap to call per test: Scout
 * hash-compares the custom-role descriptor (skipping redundant role updates) and caches
 * the SAML session per role name.
 *
 * The returned headers provision the SINGLE per-worker custom-role slot (see the warning
 * in `common/roles.ts`), so they must be used before the next `roleHeaders` call for a
 * different user — never hold headers for two custom-role users concurrently.
 */
export const roleHeaders = async (
  samlAuth: SamlAuth,
  user: MatrixUser
): Promise<Record<string, string>> => {
  const descriptor =
    typeof user === 'string'
      ? getRoleDescriptor(user)
      : await samlAuth.fetchBuiltInRoleDescriptor(user.builtInRole);
  const { cookieHeader } = await samlAuth.asInteractiveUser(descriptor);
  return { ...COMMON_HEADERS, ...cookieHeader };
};

/**
 * Builds an RBAC-forbidden response assertion for the standard spaces 403 envelope;
 * only the message varies per endpoint (e.g. `Unauthorized to delete spaces`).
 */
export const createExpectRbacForbidden =
  (message: string) =>
  (resp: { body: unknown }): void => {
    expect(resp.body).toStrictEqual({
      statusCode: 403,
      error: 'Forbidden',
      message,
    });
  };

export const expectNotFound = (resp: { body: unknown }): void => {
  expect(resp.body).toStrictEqual({
    error: 'Not Found',
    statusCode: 404,
    message: 'Not Found',
  });
};
