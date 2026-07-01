/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// TEMPORARY: validates the FTR retry intersection logic from this PR. Delete before merge.
//
// Scenario:
//   - Attempt 1 (BUILDKITE_RETRY_COUNT unset / '0'): TEST_A fails. --bail stops the run.
//     JUnit XML records TEST_A as failed; TEST_B is never reached.
//   - Attempt 2 (BUILDKITE_RETRY_COUNT == '1'): TEST_A passes (recovered).
//     TEST_B now fails (simulates an unrelated flake on retry). --bail stops the run.
//     JUnit XML records TEST_B as failed.
//
// Stored prev failures: {TEST_A}.  Current failures: {TEST_B}.  Intersection: ∅.
// Expected: ftr_configs.sh overrides exit code to 0 and the step turns green.

import type { FtrProviderContext } from '../../ftr_provider_context';

const isFirstAttempt =
  !process.env.BUILDKITE_RETRY_COUNT || process.env.BUILDKITE_RETRY_COUNT === '0';

export default function ({}: FtrProviderContext) {
  describe('retry-validation', () => {
    it('TEST_A: intentionally fails on attempt 1, passes on attempt 2', () => {
      if (isFirstAttempt) {
        throw new Error('Intentional first-attempt failure (retry validation)');
      }
    });

    it('TEST_B: passes on attempt 1, intentionally fails on attempt 2', () => {
      if (!isFirstAttempt) {
        throw new Error('Intentional second-attempt failure (retry validation)');
      }
    });
  });
}
