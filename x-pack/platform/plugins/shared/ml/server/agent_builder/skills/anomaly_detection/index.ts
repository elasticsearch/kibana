/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import {
  AD_GET_JOB_INFO_TOOL_ID,
  AD_CREATE_JOB_TOOL_ID,
  AD_MANAGE_JOB_STATE_TOOL_ID,
  AD_UPDATE_JOB_CONFIG_TOOL_ID,
} from '../../tools/tool_ids';
import skillContent from './skill.md.text';
import description from './description.text';
import esqlReadQueries from './references/esql_read_queries.md.text';
import esqlMetadataQueries from './references/esql_metadata_queries.md.text';
import esqlScoreQueries from './references/esql_score_queries.md.text';
import jobCreationRecipes from './references/job_creation_recipes.md.text';
import scoreReference from './references/score_reference.md.text';

export const createAnomalyDetectionSkill = () =>
  defineSkillType({
    id: 'ml.anomaly-detection',
    name: 'anomaly-detection',
    basePath: 'skills/ml/anomaly_detection',
    description,
    content: skillContent,
    referencedContent: [
      { name: 'esql-read-queries', relativePath: './references', content: esqlReadQueries },
      { name: 'esql-metadata-queries', relativePath: './references', content: esqlMetadataQueries },
      { name: 'esql-score-queries', relativePath: './references', content: esqlScoreQueries },
      { name: 'job-creation-recipes', relativePath: './references', content: jobCreationRecipes },
      { name: 'score-reference', relativePath: './references', content: scoreReference },
    ],
    getRegistryTools: () => [
      'platform.core.execute_esql',
      AD_GET_JOB_INFO_TOOL_ID,
      AD_CREATE_JOB_TOOL_ID,
      AD_MANAGE_JOB_STATE_TOOL_ID,
      AD_UPDATE_JOB_CONFIG_TOOL_ID,
    ],
  });
