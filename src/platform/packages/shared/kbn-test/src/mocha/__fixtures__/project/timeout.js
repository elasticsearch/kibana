/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// The shape of an aborted config run: a hook times out, then so does the teardown hook mocha runs
// afterwards.
describe('TIMEOUT_SUITE', () => {
  before('root cause', async function () {
    this.timeout(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('never runs', () => {});

  after('cascading', async function () {
    this.timeout(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
});
