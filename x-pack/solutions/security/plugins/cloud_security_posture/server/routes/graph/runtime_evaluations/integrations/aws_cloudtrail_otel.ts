/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const aws_cloudtrail_otelEvaluations = {
  integration: "aws_cloudtrail_otel",
  evaluations: [
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset == "aws.cloudtrail.otel" AND aws.principal.type IN ("IAMUser", "AssumedRole", "FederatedUser", "Root", "IdentityCenterUser") AND aws.principal.arn IS NOT NULL, aws.principal.arn,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "aws.cloudtrail.otel" AND aws.principal.type == "AssumedRole" AND aws.user_identity.session_context.issuer.user_name IS NOT NULL, aws.user_identity.session_context.issuer.user_name,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "aws.cloudtrail.otel" AND source.address IS NOT NULL, source.address,
    null
  ),
  service.name = CASE(
    service.name IS NOT NULL, service.name,
    data_stream.dataset == "aws.cloudtrail.otel" AND aws.principal.type == "AWSService" AND aws.user_identity.invoked_by IS NOT NULL, aws.user_identity.invoked_by,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "aws.cloudtrail.otel" AND rpc.method IS NOT NULL, rpc.method,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "aws.cloudtrail.otel" AND rpc.method == "GetCallerIdentity" AND rpc.service IS NOT NULL, rpc.service,
    data_stream.dataset == "aws.cloudtrail.otel" AND rpc.method IN ("PutObject", "GetObject") AND rpc.service IS NOT NULL, rpc.service,
    null
  ),
  user.target.id = CASE(
    user.target.id IS NOT NULL, user.target.id,
    data_stream.dataset == "aws.cloudtrail.otel" AND rpc.method == "AttachUserPolicy" AND aws.request.parameters.userName IS NOT NULL, aws.request.parameters.userName,
    null
  ),
  user.target.name = CASE(
    user.target.name IS NOT NULL, user.target.name,
    data_stream.dataset == "aws.cloudtrail.otel" AND rpc.method == "AttachUserPolicy" AND aws.request.parameters.userName IS NOT NULL, aws.request.parameters.userName,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
