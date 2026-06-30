/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const qualys_vmdrEvaluations = {
  integration: "qualys_vmdr",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.name IS NOT NULL OR user.roles IS NOT NULL
    OR source.ip IS NOT NULL
    OR service.name IS NOT NULL OR entity.id IS NOT NULL OR entity.name IS NOT NULL,
  target_exists = user.target.id IS NOT NULL OR user.target.name IS NOT NULL OR user.target.email IS NOT NULL
    OR host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
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
    data_stream.dataset == "qualys_vmdr.user_activity" AND event.action == "login", "service",
    data_stream.dataset == "qualys_vmdr.user_activity" AND event.action == "request", "service",
    data_stream.dataset == "qualys_vmdr.user_activity" AND event.provider == "host_attribute", "host",
    data_stream.dataset == "qualys_vmdr.asset_host_detection", "host",
    null
  )`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset == "qualys_vmdr.user_activity" AND user.name IS NOT NULL, user.name,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "qualys_vmdr.user_activity" AND source.ip IS NOT NULL, source.ip,
    null
  ),
  service.name = CASE(
    service.name IS NOT NULL, service.name,
    data_stream.dataset == "qualys_vmdr.asset_host_detection" AND qualys_vmdr.asset_host_detection.vulnerability.latest_vulnerability_detection_source IS NOT NULL, qualys_vmdr.asset_host_detection.vulnerability.latest_vulnerability_detection_source,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "qualys_vmdr.user_activity" AND event.action == "login", "Qualys VMDR",
    data_stream.dataset == "qualys_vmdr.user_activity" AND event.action == "request" AND message IS NOT NULL, message,
    null
  ),
  host.target.id = CASE(
    host.target.id IS NOT NULL, host.target.id,
    data_stream.dataset == "qualys_vmdr.asset_host_detection" AND host.id IS NOT NULL, host.id,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "qualys_vmdr.asset_host_detection" AND host.name IS NOT NULL, host.name,
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "qualys_vmdr.asset_host_detection" AND host.ip IS NOT NULL, host.ip,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "qualys_vmdr.asset_host_detection" AND event.id IS NOT NULL, event.id,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
