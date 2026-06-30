/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const aws_bedrock_agentcoreEvaluations = {
  integration: 'aws_bedrock_agentcore',
  evaluations: [
    {
      id: 'detection_flags',
      section: 'Detection flags (mandatory \u2014 run first)',
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL
    OR host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
    OR service.id IS NOT NULL
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
  entity.type = CASE(
    entity.type IS NOT NULL, entity.type,
    data_stream.dataset IN ("aws_bedrock_agentcore.runtime_application_logs", "aws_bedrock_agentcore.memory_application_logs"), "user",
    data_stream.dataset == "aws_bedrock_agentcore.gateway_application_logs", "service",
    null
  ),
  entity.sub_type = CASE(
    entity.sub_type IS NOT NULL, entity.sub_type,
    data_stream.dataset == "aws_bedrock_agentcore.gateway_application_logs", "agentcore_gateway",
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "aws_bedrock_agentcore.gateway_application_logs" AND aws.bedrock_agentcore.gateway.target IS NOT NULL, "general",
    data_stream.dataset IN ("aws_bedrock_agentcore.runtime_application_logs", "aws_bedrock_agentcore.memory_application_logs"), "service",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "aws_bedrock_agentcore.gateway_application_logs" AND aws.bedrock_agentcore.gateway.target IS NOT NULL, "tool_target",
    data_stream.dataset == "aws_bedrock_agentcore.runtime_application_logs", "runtime_endpoint",
    data_stream.dataset == "aws_bedrock_agentcore.memory_application_logs" AND aws.bedrock_agentcore.memory.memory_strategy IS NOT NULL, aws.bedrock_agentcore.memory.memory_strategy,
    null
  )`,
    },
    {
      id: 'actor',
      section: 'Combined ES|QL \u2014 actor fields',
      esql: `| EVAL
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset == "aws_bedrock_agentcore.runtime_application_logs" AND aws.bedrock_agentcore.request_payload.actor_id IS NOT NULL, aws.bedrock_agentcore.request_payload.actor_id,
    data_stream.dataset == "aws_bedrock_agentcore.memory_application_logs" AND aws.bedrock_agentcore.memory.actor_id IS NOT NULL, aws.bedrock_agentcore.memory.actor_id,
    null
  ),
  service.id = CASE(
    service.id IS NOT NULL, service.id,
    data_stream.dataset == "aws_bedrock_agentcore.gateway_application_logs" AND aws.bedrock_agentcore.gateway.resource_arn IS NOT NULL, aws.bedrock_agentcore.gateway.resource_arn,
    null
  )`,
    },
    {
      id: 'event_action',
      section: 'Combined ES|QL \u2014 event action',
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "aws_bedrock_agentcore.runtime_application_logs" AND aws.bedrock_agentcore.operation IS NOT NULL, aws.bedrock_agentcore.operation,
    data_stream.dataset == "aws_bedrock_agentcore.memory_application_logs" AND aws.bedrock_agentcore.memory.operation_name IS NOT NULL, aws.bedrock_agentcore.memory.operation_name,
    null
  )`,
    },
    {
      id: 'target',
      section: 'Combined ES|QL \u2014 target fields',
      esql: `| EVAL
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset == "aws_bedrock_agentcore.runtime_application_logs" AND aws.bedrock_agentcore.resource_arn IS NOT NULL, aws.bedrock_agentcore.resource_arn,
    data_stream.dataset == "aws_bedrock_agentcore.memory_application_logs" AND aws.bedrock_agentcore.memory.resource_arn IS NOT NULL, aws.bedrock_agentcore.memory.resource_arn,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "aws_bedrock_agentcore.runtime_application_logs" AND service.name IS NOT NULL, service.name,
    data_stream.dataset == "aws_bedrock_agentcore.memory_application_logs" AND service.name IS NOT NULL, service.name,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "aws_bedrock_agentcore.gateway_application_logs" AND aws.bedrock_agentcore.gateway.target IS NOT NULL, aws.bedrock_agentcore.gateway.target,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
