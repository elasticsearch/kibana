/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const aws_bedrockEvaluations = {
  integration: 'aws_bedrock',
  evaluations: [
    {
      id: 'detection_flags',
      section: 'Detection flags (mandatory \u2014 run first)',
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL
    OR host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
    OR service.id IS NOT NULL OR service.name IS NOT NULL
    OR entity.id IS NOT NULL OR entity.name IS NOT NULL,
  target_exists = user.target.id IS NOT NULL OR user.target.name IS NOT NULL OR user.target.email IS NOT NULL
    OR host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
    OR service.target.id IS NOT NULL OR service.target.name IS NOT NULL
    OR entity.target.id IS NOT NULL OR entity.target.name IS NOT NULL,
  action_exists = event.action IS NOT NULL`,
    },
    {
      id: 'optional_classification',
      section: 'Optional classification helpers (when needed)',
      esql: `| EVAL
  entity.sub_type = CASE(
    entity.sub_type IS NOT NULL, entity.sub_type,
    data_stream.dataset == "aws_bedrock.invocation" AND user.id IS NOT NULL AND user.id LIKE "arn:aws:sts:*:assumed-role/*", "assumed_role",
    data_stream.dataset == "aws_bedrock.invocation" AND user.id IS NOT NULL AND user.id LIKE "arn:aws:iam:*:user/*", "iam_user",
    null
  ),
  service.target.sub_type = CASE(
    service.target.sub_type IS NOT NULL, service.target.sub_type,
    data_stream.dataset == "aws_bedrock.invocation" AND gen_ai.request.model.id IS NOT NULL, "foundation_model",
    null
  )`,
    },
    {
      id: 'event_action',
      section: 'Combined ES|QL \u2014 event action',
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "aws_bedrock.guardrails" AND aws_bedrock.guardrails.operation IS NOT NULL, aws_bedrock.guardrails.operation,
    null
  )`,
    },
    {
      id: 'target',
      section: 'Combined ES|QL \u2014 target fields',
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "aws_bedrock.invocation" AND cloud.service.name IS NOT NULL, cloud.service.name,
    null
  ),
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset == "aws_bedrock.invocation" AND gen_ai.request.model.id IS NOT NULL, gen_ai.request.model.id,
    null
  ),
  service.target.type = CASE(
    service.target.type IS NOT NULL, service.target.type,
    data_stream.dataset == "aws_bedrock.invocation" AND gen_ai.request.model.type IS NOT NULL, gen_ai.request.model.type,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
