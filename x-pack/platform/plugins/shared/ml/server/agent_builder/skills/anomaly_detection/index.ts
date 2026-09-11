/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import type { ResolveMlCapabilities } from '@kbn/ml-common-types/capabilities';
import type { MlLicense } from '../../../../common/license';
import type { MlFeatures } from '../../../../common/constants/app';
import type { MlAuthorizationService } from '../../../lib/capabilities/check_capabilities';
import type { BuildMlClientFn, BuildDataRecognizerFn } from '../../ml_client_factory';
import { createAdGetJobInfoTool } from '../../tools/ad_get_job_info';
import { createAdCreateJobTool } from '../../tools/ad_create_job';
import { createAdManageJobStateTool } from '../../tools/ad_manage_job_state';
import { createAdUpdateJobConfigTool } from '../../tools/ad_update_job_config';
import { createQueryAnomaliesTool } from '../../tools/query_anomalies';
import { createMlChartsTool } from '../../tools/create_ml_charts';
import skillContent from './skill.md.text';
import description from './description.text';
import esqlReadQueries from './references/esql_read_queries.md.text';
import esqlMetadataQueries from './references/esql_metadata_queries.md.text';
import esqlScoreQueries from './references/esql_score_queries.md.text';
import jobCreationRecipes from './references/job_creation_recipes.md.text';
import scoreReference from './references/score_reference.md.text';

export const createAnomalyDetectionSkill = (
  resolveMlCapabilities: ResolveMlCapabilities,
  authorization?: MlAuthorizationService,
  mlLicense?: MlLicense,
  enabledFeatures?: MlFeatures,
  buildMlClient?: BuildMlClientFn,
  buildDataRecognizer?: BuildDataRecognizerFn
) =>
  defineSkillType({
    id: 'ml.anomaly-detection',
    name: 'anomaly-detection',
    basePath: 'skills/ml/anomaly_detection',
    description,
    experimental: true,
    content: skillContent,
    referencedContent: [
      { name: 'esql-read-queries', relativePath: './references', content: esqlReadQueries },
      { name: 'esql-metadata-queries', relativePath: './references', content: esqlMetadataQueries },
      { name: 'esql-score-queries', relativePath: './references', content: esqlScoreQueries },
      { name: 'job-creation-recipes', relativePath: './references', content: jobCreationRecipes },
      { name: 'score-reference', relativePath: './references', content: scoreReference },
    ],
    getRegistryTools: () => [
      // Source-data ES|QL (RCA evidence, ingest latency) still needs the current-user tool.
      'platform.core.execute_esql',
    ],
    getInlineTools: () => [
      createAdGetJobInfoTool(resolveMlCapabilities, authorization, mlLicense, enabledFeatures),
      createAdCreateJobTool(
        resolveMlCapabilities,
        authorization,
        mlLicense,
        enabledFeatures,
        buildMlClient,
        buildDataRecognizer
      ),
      createAdManageJobStateTool(
        resolveMlCapabilities,
        authorization,
        mlLicense,
        enabledFeatures,
        buildMlClient
      ),
      createAdUpdateJobConfigTool(
        resolveMlCapabilities,
        authorization,
        mlLicense,
        enabledFeatures,
        buildMlClient
      ),
      createQueryAnomaliesTool(resolveMlCapabilities, authorization, mlLicense, enabledFeatures),
      createMlChartsTool(
        resolveMlCapabilities,
        authorization,
        mlLicense,
        enabledFeatures,
        buildMlClient
      ),
    ],
  });
