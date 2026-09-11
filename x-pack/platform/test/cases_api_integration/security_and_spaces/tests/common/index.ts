/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../common/ftr_provider_context';

export default ({ loadTestFile }: FtrProviderContext): void => {
  describe('Common', function () {
    /**
     * Public routes
     */
    loadTestFile(require.resolve('./comments/bulk_delete_comments'));
    loadTestFile(require.resolve('./comments/find_comments'));
    loadTestFile(require.resolve('./comments/get_comment'));
    loadTestFile(require.resolve('./comments/patch_comment'));
    loadTestFile(require.resolve('./files/post_file'));
    loadTestFile(require.resolve('./files/post_file_attachment'));
    loadTestFile(require.resolve('./alerts/get_cases'));
    loadTestFile(require.resolve('./alerts/get_alerts_attached_to_case'));
    loadTestFile(require.resolve('./cases/import_export'));
    loadTestFile(require.resolve('./cases/find_cases'));
    loadTestFile(require.resolve('./cases/get_case'));
    loadTestFile(require.resolve('./cases/post_case'));
    loadTestFile(require.resolve('./cases/resolve_case'));
    loadTestFile(require.resolve('./cases/reporters/get_reporters'));
    loadTestFile(require.resolve('./cases/tags/get_tags'));
    loadTestFile(require.resolve('./cases/categories/get_categories'));
    loadTestFile(require.resolve('./user_actions/find_user_actions'));
    loadTestFile(require.resolve('./user_actions/get_user_action_stats'));
    loadTestFile(require.resolve('./configure/get_configure'));
    loadTestFile(require.resolve('./configure/patch_configure'));
    loadTestFile(require.resolve('./configure/post_configure'));
    loadTestFile(require.resolve('./internal/metrics/get_case_metrics'));
    loadTestFile(require.resolve('./internal/metrics/get_case_metrics_alerts'));
    loadTestFile(require.resolve('./internal/metrics/get_case_metrics_connectors'));
    loadTestFile(require.resolve('./internal/metrics/get_cases_metrics'));

    /**
     * Internal routes
     */
    loadTestFile(require.resolve('./internal/bulk_get_cases'));
    loadTestFile(require.resolve('./internal/bulk_get_attachments'));
    loadTestFile(require.resolve('./internal/bulk_create_attachments'));
    loadTestFile(require.resolve('./internal/get_connectors'));
    loadTestFile(require.resolve('./internal/user_actions_get_users'));
    loadTestFile(require.resolve('./internal/bulk_delete_file_attachments'));
    loadTestFile(require.resolve('./internal/search_cases'));
    loadTestFile(require.resolve('./internal/replace_custom_field'));
    loadTestFile(require.resolve('./internal/find_user_actions.ts'));

    // NOTE: The attachments-framework suites are flag-sensitive and run under
    // their own configs with the feature flag pinned

    /**
     * Cases client
     */
    loadTestFile(require.resolve('./cases/bulk_create_cases'));

    // NOTE: Migrations are not included because they can inadvertently remove the .kibana indices which removes the users and spaces
    // which causes errors in any tests after them that relies on those

    /**
     * Cases analytics
     */
    loadTestFile(require.resolve('./cases/analytics_index/creation'));
    loadTestFile(require.resolve('./cases/analytics_index/backfill'));
    loadTestFile(require.resolve('./cases/analytics_index/synchronization'));
  });
};
