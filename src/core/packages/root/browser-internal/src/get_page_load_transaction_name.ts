/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const APP_ID_FROM_PATH_REGEX = /\/app\/([^/?#]+)/;

const stripBasePath = (pathname: string, basePath: string): string => {
  if (!basePath || basePath === '/') {
    return pathname;
  }

  if (pathname === basePath) {
    return '/';
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }

  return pathname;
};

/**
 * Derives a low-cardinality page-load transaction name from a URL pathname.
 *
 * - App routes resolve to `/app/{appId}` regardless of deeper path segments.
 * - Non-app routes resolve to their first path segment only (e.g. `/login`),
 *   so dynamic tails on chromeless non-app routes (such as the short-URL id in
 *   `/goto/{id}`) cannot leak into the name and inflate transaction cardinality.
 */
export const getPageLoadTransactionName = (pathname: string, basePath = ''): string => {
  const path = stripBasePath(pathname, basePath);
  const appMatch = path.match(APP_ID_FROM_PATH_REGEX);

  if (appMatch) {
    return `/app/${appMatch[1]}`;
  }

  const [, firstSegment] = path.split('/');
  return firstSegment ? `/${firstSegment}` : path;
};

export const isAppPath = (pathname: string, basePath = ''): boolean => {
  return APP_ID_FROM_PATH_REGEX.test(stripBasePath(pathname, basePath));
};
