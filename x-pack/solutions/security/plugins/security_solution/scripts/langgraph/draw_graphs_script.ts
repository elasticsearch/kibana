/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import { ToolingLog } from '@kbn/tooling-log';
import { FakeLLM } from '@langchain/core/utils/testing';
import fs from 'fs/promises';
import path from 'path';
import type {
  ElasticsearchClient,
  IScopedClusterClient,
  KibanaRequest,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { InferenceChatModel } from '@kbn/inference-langchain';
import type { ExperimentalFeatures } from '../../common';
import { getRulesMigrationTools } from '../../server/lib/siem_migrations/rules/task/agent/tools';
import type { DashboardMigrationsRetriever } from '../../server/lib/siem_migrations/dashboards/task/retrievers';
import { getDashboardMigrationAgent } from '../../server/lib/siem_migrations/dashboards/task/agent';
import type { DashboardMigrationTelemetryClient } from '../../server/lib/siem_migrations/dashboards/task/dashboard_migrations_telemetry_client';
import type { ChatModel } from '../../server/lib/siem_migrations/common/task/util/actions_client_chat';
import { getGenerateEsqlGraph as getGenerateEsqlAgent } from '../../server/assistant/tools/esql/graphs/generate_esql/generate_esql';
import { getRuleMigrationAgent } from '../../server/lib/siem_migrations/rules/task/agent';
import type { RuleMigrationsRetriever } from '../../server/lib/siem_migrations/rules/task/retrievers';
import type { EsqlKnowledgeBase } from '../../server/lib/siem_migrations/common/task/util/esql_knowledge_base';
import type { RuleMigrationTelemetryClient } from '../../server/lib/siem_migrations/rules/task/rule_migrations_telemetry_client';
import type { CreateLlmInstance } from '../../server/assistant/tools/esql/utils/common';
import type { RuleMigrationsDataClient } from '../../server/lib/siem_migrations/rules/data/rule_migrations_data_client';
import { getBuildAgent } from '../../server/lib/detection_engine/ai_rule_creation/agent/build_agent_graph';

interface Drawable {
  drawMermaidPng: () => Promise<Blob>;
}

const mockLlm = new FakeLLM({
  response: JSON.stringify({}, null, 2),
}) as unknown as InferenceChatModel;

const esqlKnowledgeBase = {} as EsqlKnowledgeBase;
const ruleMigrationsRetriever = {} as RuleMigrationsRetriever;
const dashboardMigrationsRetriever = {} as DashboardMigrationsRetriever;

const createLlmInstance = () => ({
  ...mockLlm,
  bindTools: () => null,
});

async function getSiemRuleMigrationGraph(logger: Logger): Promise<Drawable> {
  const model = createLlmInstance() as unknown as ChatModel;
  const telemetryClient = {} as RuleMigrationTelemetryClient;
  const tools = getRulesMigrationTools('some_migration_id', {
    rulesClient: {} as unknown as RuleMigrationsDataClient,
    ruleMigrationsRetriever,
  });
  const graph = getRuleMigrationAgent({
    model,
    esqlKnowledgeBase,
    ruleMigrationsRetriever,
    logger,
    telemetryClient,
    tools,
  });
  return graph.getGraphAsync({ xray: true });
}

async function getSiemDashboardMigrationGraph(logger: Logger): Promise<Drawable> {
  const model = { bindTools: () => null } as unknown as ChatModel;
  const telemetryClient = {} as DashboardMigrationTelemetryClient;
  const esScopedClient = {} as IScopedClusterClient;
  const graph = getDashboardMigrationAgent({
    model,
    esScopedClient,
    esqlKnowledgeBase,
    dashboardMigrationsRetriever,
    logger,
    telemetryClient,
    inference: {} as InferenceServerStart,
    request: {} as KibanaRequest,
    connectorId: 'test-connector-id',
    experimentalFeatures: {} as unknown as ExperimentalFeatures,
  });
  return graph.getGraphAsync({ xray: true });
}

async function getGenerateEsqlGraph(logger: Logger): Promise<Drawable> {
  const graph = await getGenerateEsqlAgent({
    esClient: {} as unknown as ElasticsearchClient,
    connectorId: 'test-connector-id',
    inference: {} as unknown as InferenceServerStart,
    logger,
    request: {} as unknown as KibanaRequest,
    createLlmInstance: (() => ({ bindTools: () => null })) as unknown as CreateLlmInstance,
  });
  return graph.getGraphAsync({ xray: true });
}

async function getAiRuleCreationGraph(logger: Logger): Promise<Drawable> {
  const graph = await getBuildAgent({
    model: mockLlm,
    esClient: {} as unknown as ElasticsearchClient,
    connectorId: 'test-connector-id',
    inference: {} as unknown as InferenceServerStart,
    logger,
    request: {} as unknown as KibanaRequest,
    savedObjectsClient: {} as unknown as SavedObjectsClientContract,
    rulesClient: {} as unknown as RulesClient,
  });
  return graph.getGraphAsync({ xray: true });
}

export const drawGraph = async ({
  getGraphAsync,
  outputFilename,
}: {
  getGraphAsync: (logger: Logger) => Promise<Drawable>;
  outputFilename: string;
}) => {
  const logger = new ToolingLog({
    level: 'info',
    writeTo: process.stdout,
  }) as unknown as Logger;
  logger.info('Compiling graph');
  const outputPath = path.join(__dirname, outputFilename);
  const graph = await getGraphAsync(logger);
  logger.info('Drawing graph');
  const output = await graph.drawMermaidPng();
  const buffer = Buffer.from(await output.arrayBuffer());
  logger.info(`Writing graph to ${outputPath}`);
  await fs.writeFile(outputPath, buffer);
};

export const draw = async () => {
  await drawGraph({
    getGraphAsync: getGenerateEsqlGraph,
    outputFilename: '../../docs/generate_esql/img/generate_esql_graph.png',
  });
  await drawGraph({
    getGraphAsync: getSiemRuleMigrationGraph,
    outputFilename: '../../docs/siem_migration/img/rule_migration_agent_graph.png',
  });
  await drawGraph({
    getGraphAsync: getSiemDashboardMigrationGraph,
    outputFilename: '../../docs/siem_migration/img/dashboard_migration_agent_graph.png',
  });
  await drawGraph({
    getGraphAsync: getAiRuleCreationGraph,
    outputFilename: '../../docs/ai_rule_creation/img/ai_rule_creation_graph.png',
  });
};
