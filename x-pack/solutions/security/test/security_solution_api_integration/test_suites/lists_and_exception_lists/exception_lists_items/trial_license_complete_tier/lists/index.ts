/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../../ftr_provider_context';

export default function ({ loadTestFile }: FtrProviderContext) {
  describe('Exception Lists - Lists APIs', function () {
    loadTestFile(require.resolve('./duplicate_exception_list'));
    loadTestFile(require.resolve('./get_exception_filter'));
    loadTestFile(require.resolve('./import_exceptions'));
    loadTestFile(require.resolve('./export_exception_list'));
    loadTestFile(require.resolve('./export_exception_lists'));
    loadTestFile(require.resolve('./create_exception_lists'));
    loadTestFile(require.resolve('./read_exception_lists'));
    loadTestFile(require.resolve('./update_exception_lists'));
    loadTestFile(require.resolve('./delete_exception_lists'));
    loadTestFile(require.resolve('./find_exception_lists'));
    loadTestFile(require.resolve('./summary_exception_lists'));
  });
}
