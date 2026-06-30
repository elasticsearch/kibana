/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const aws_vpcflow_otelEvaluations = {
  integration: "aws_vpcflow_otel",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
    OR service.id IS NOT NULL OR service.name IS NOT NULL
    OR entity.id IS NOT NULL OR entity.name IS NOT NULL,
  target_exists = host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
    OR service.target.id IS NOT NULL OR service.target.name IS NOT NULL
    OR entity.target.id IS NOT NULL OR entity.target.name IS NOT NULL,
  action_exists = event.action IS NOT NULL`,
    },
    {
      id: "optional_classification",
      section: "Optional classification helpers (when needed)",
      esql: `| EVAL
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "aws.vpcflow.otel" AND aws.vpc.flow.destination.service IS NOT NULL, "service",
    data_stream.dataset == "aws.vpcflow.otel", "host",
    null
  )`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "aws.vpcflow.otel" AND source.address IS NOT NULL, source.address,
    null
  ),
  host.name = CASE(
    host.name IS NOT NULL, host.name,
    data_stream.dataset == "aws.vpcflow.otel" AND source.address IS NOT NULL, source.address,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "aws.vpcflow.otel" AND aws.vpc.flow.action IS NOT NULL, aws.vpc.flow.action,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "aws.vpcflow.otel" AND destination.address IS NOT NULL, destination.address,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "aws.vpcflow.otel" AND destination.address IS NOT NULL, destination.address,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "aws.vpcflow.otel" AND aws.vpc.flow.destination.service IS NOT NULL, aws.vpc.flow.destination.service,
    data_stream.dataset == "aws.vpcflow.otel" AND network.protocol.name IS NOT NULL, network.protocol.name,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
