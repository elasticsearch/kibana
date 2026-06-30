/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const sysdigEvaluations = {
  integration: "sysdig",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
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
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset == "sysdig.alerts" AND event.provider == "syscall", sysdig.content.fields.user.uid,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "sysdig.alerts" AND event.provider == "syscall", sysdig.content.fields.user.name,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "sysdig.event" AND source.ip IS NOT NULL, source.ip,
    null
  ),
  service.name = CASE(
    service.name IS NOT NULL, service.name,
    data_stream.dataset IN ("sysdig.cspm", "sysdig.vulnerability"), "Sysdig Secure",
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "sysdig.event" AND event.provider == "syscall" AND sysdig.event.content.fields.evt.type IS NOT NULL, sysdig.event.content.fields.evt.type,
    data_stream.dataset == "sysdig.event" AND event.provider == "aws_cloudtrail" AND sysdig.event.content.fields.aws.event_name IS NOT NULL, sysdig.event.content.fields.aws.event_name,
    data_stream.dataset IN ("sysdig.event", "sysdig.alerts") AND rule.name IS NOT NULL, rule.name,
    data_stream.dataset == "sysdig.alerts" AND event.provider == "syscall" AND process.name IS NOT NULL, process.name,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset IN ("sysdig.event", "sysdig.alerts") AND container.id IS NOT NULL, container.id,
    data_stream.dataset == "sysdig.event" AND orchestrator.resource.name IS NOT NULL, orchestrator.resource.name,
    data_stream.dataset == "sysdig.vulnerability", resource.id,
    data_stream.dataset == "sysdig.alerts" AND event.provider == "aws_cloudtrail", cloud.account.id,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset IN ("sysdig.event", "sysdig.alerts") AND container.name IS NOT NULL, container.name,
    data_stream.dataset == "sysdig.alerts" AND sysdig.content.fields.container.name IS NOT NULL, sysdig.content.fields.container.name,
    data_stream.dataset IN ("sysdig.event", "sysdig.alerts") AND orchestrator.resource.name IS NOT NULL, orchestrator.resource.name,
    data_stream.dataset == "sysdig.event" AND sysdig.event.content.fields.fd.name IS NOT NULL, sysdig.event.content.fields.fd.name,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset IN ("sysdig.event", "sysdig.alerts") AND (container.id IS NOT NULL OR container.name IS NOT NULL), "container",
    data_stream.dataset == "sysdig.cspm", sysdig.cspm.control.resource_kind,
    data_stream.dataset == "sysdig.vulnerability" AND sysdig.vulnerability.asset_type == "containerImage", "container-image",
    data_stream.dataset == "sysdig.vulnerability" AND sysdig.vulnerability.asset_type == "host", "host",
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset IN ("sysdig.event", "sysdig.vulnerability") AND host.name IS NOT NULL, host.name,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset IN ("sysdig.event", "sysdig.alerts") AND event.provider == "aws_cloudtrail", event.provider,
    null
  ),
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset == "sysdig.alerts" AND event.provider == "aws_cloudtrail" AND cloud.account.id IS NOT NULL, cloud.account.id,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
