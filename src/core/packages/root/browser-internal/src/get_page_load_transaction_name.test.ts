/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getPageLoadTransactionName, isAppPath } from './get_page_load_transaction_name';

describe('getPageLoadTransactionName', () => {
  it('returns /app/{appId} for deep app routes', () => {
    expect(getPageLoadTransactionName('/app/apm/services/my-service/overview')).toBe('/app/apm');
  });

  it('returns /app/{appId} for space-prefixed app routes', () => {
    expect(getPageLoadTransactionName('/s/my-space/app/discover/some/path')).toBe('/app/discover');
  });

  it('strips the server base path before resolving app routes', () => {
    expect(getPageLoadTransactionName('/alpha/app/apm/services/foo', '/alpha')).toBe('/app/apm');
  });

  it('returns the pathname for non-app routes', () => {
    expect(getPageLoadTransactionName('/login')).toBe('/login');
    expect(getPageLoadTransactionName('/status')).toBe('/status');
  });

  it('bounds non-app routes to their first segment so dynamic tails cannot inflate cardinality', () => {
    // /goto/{id} is a chromeless redirect app; the id must not leak into the name
    expect(getPageLoadTransactionName('/goto/abcdef123456')).toBe('/goto');
    expect(getPageLoadTransactionName('/spaces/space_selector')).toBe('/spaces');
  });

  it('returns the root pathname unchanged', () => {
    expect(getPageLoadTransactionName('/')).toBe('/');
  });
});

describe('isAppPath', () => {
  it('detects app routes', () => {
    expect(isAppPath('/app/apm/services/foo')).toBe(true);
    expect(isAppPath('/login')).toBe(false);
  });
});
