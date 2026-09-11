/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';

export default function aiAssistantApiIntegrationTests({
  loadTestFile,
}: DeploymentAgnosticFtrProviderContext) {
  describe('observability AI Assistant', function () {
    // Functions
    loadTestFile(require.resolve('./complete/functions/alerts.spec.ts'));
    loadTestFile(require.resolve('./complete/functions/context.spec.ts'));
    loadTestFile(require.resolve('./complete/functions/elasticsearch.spec.ts'));
    loadTestFile(require.resolve('./complete/functions/execute_query.spec.ts'));
    loadTestFile(require.resolve('./complete/functions/get_alerts_dataset_info.spec.ts'));
    loadTestFile(require.resolve('./complete/functions/get_dataset_info.spec.ts'));
    loadTestFile(require.resolve('./complete/functions/recall.spec.ts'));
    loadTestFile(require.resolve('./complete/functions/retrieve_elastic_doc.spec.ts'));
    loadTestFile(require.resolve('./complete/functions/summarize.spec.ts'));
    loadTestFile(require.resolve('./complete/functions/title_conversation.spec.ts'));
    loadTestFile(require.resolve('./complete/functions/visualize_query.spec.ts'));

    // knowledge base
    loadTestFile(require.resolve('./knowledge_base/knowledge_base_8.10_upgrade_test.spec.ts'));
    loadTestFile(require.resolve('./knowledge_base/knowledge_base_8.18_upgrade_test.spec.ts'));
    loadTestFile(require.resolve('./knowledge_base/knowledge_base_reindex_concurrency.spec.ts'));
    loadTestFile(require.resolve('./knowledge_base/knowledge_base_setup.spec.ts'));
    loadTestFile(require.resolve('./knowledge_base/knowledge_base_status.spec.ts'));
    loadTestFile(require.resolve('./knowledge_base/knowledge_base_user_instructions.spec.ts'));
    loadTestFile(require.resolve('./knowledge_base/knowledge_base_basic_operations.spec.ts'));
    loadTestFile(
      require.resolve('./knowledge_base/knowledge_base_change_model_from_elser_to_e5.spec.ts')
    );

    // Misc.
    loadTestFile(require.resolve('./chat/chat.spec.ts'));
    loadTestFile(require.resolve('./elasticsearch_tool/elasticsearch_tool.spec.ts'));
    loadTestFile(require.resolve('./complete/complete.spec.ts'));
    loadTestFile(require.resolve('./complete/public_complete.spec.ts'));
    loadTestFile(require.resolve('./index_assets/index_assets.spec.ts'));
    loadTestFile(require.resolve('./connectors/connectors.spec.ts'));
    loadTestFile(require.resolve('./connectors/connector_resolution.spec.ts'));
    loadTestFile(require.resolve('./conversations/conversations.spec.ts'));
    loadTestFile(require.resolve('./anonymization/anonymization.spec.ts'));

    loadTestFile(require.resolve('./distributed_lock_manager/distributed_lock_manager.spec.ts'));
  });
}
