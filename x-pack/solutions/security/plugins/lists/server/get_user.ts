/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SecurityRequestHandlerContext } from '@kbn/core-security-server';

export interface GetUserOptions {
  security: SecurityRequestHandlerContext;
}

export const getUser = ({ security }: GetUserOptions): string => {
  if (security != null) {
    const authenticatedUser = security.authc.getCurrentUser();
    if (authenticatedUser != null) {
      return authenticatedUser.username;
    } else {
      return 'elastic';
    }
  } else {
    return 'elastic';
  }
};

export const getUserDisplayName = ({ security }: GetUserOptions): string => {
  if (security != null) {
    const authenticatedUser = security.authc.getCurrentUser();
    if (authenticatedUser != null) {
      if (authenticatedUser.full_name != null && authenticatedUser.full_name.length > 0) {
        return authenticatedUser.full_name;
      }

      if (authenticatedUser.email != null && authenticatedUser.email.length > 0) {
        return authenticatedUser.email;
      }

      return authenticatedUser.username;
    } else {
      return 'elastic';
    }
  } else {
    return 'elastic';
  }
};
