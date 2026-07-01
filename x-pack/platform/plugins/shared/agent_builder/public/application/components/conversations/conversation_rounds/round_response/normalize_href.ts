/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IBasePath } from '@kbn/core-http-browser';

/**
 * Prepends the Kibana base path (server base path + active space) to a URL.
 * Absolute (`https://…`) and protocol-relative (`//…`) URLs pass through untouched.
 *
 * @example
 * href: '/app/security/rules'
 * basePath: ''
 * Result: '/app/security/rules'
 *
 * @example
 * href: '/app/security/rules'
 * basePath: '/kbn/s/my-space'
 * Result: '/kbn/s/my-space/app/security/rules'
 *
 * @example
 * href: 'https://elastic.co/docs'
 * basePath: '/kbn'
 * Result: 'https://elastic.co/docs'
 */
export const normalizeHref = (href: string, basePath: IBasePath | undefined): string => {
  if (!basePath) {
    return href;
  }

  const isRootRelative = href.startsWith('/') && !href.startsWith('//');
  return isRootRelative ? basePath.prepend(href) : href;
};
