/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const snortEvaluations = {
  integration: "snort",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
    OR entity.id IS NOT NULL OR entity.name IS NOT NULL,
  target_exists = host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
    OR service.target.id IS NOT NULL OR service.target.name IS NOT NULL
    OR entity.target.id IS NOT NULL OR entity.target.name IS NOT NULL,
  action_exists = event.action IS NOT NULL`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "snort.log" AND source.ip IS NOT NULL, source.ip,
    data_stream.dataset == "snort.log" AND source.ip IS NULL AND source.address IS NOT NULL, source.address,
    null
  ),
  host.id = CASE(
    host.id IS NOT NULL, host.id,
    data_stream.dataset == "snort.log" AND source.ip IS NOT NULL, TO_STRING(source.ip),
    data_stream.dataset == "snort.log" AND source.ip IS NULL AND source.mac IS NOT NULL, source.mac,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "snort.log" AND rule.description IS NOT NULL, rule.description,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "snort.log" AND destination.ip IS NOT NULL, destination.ip,
    data_stream.dataset == "snort.log" AND destination.ip IS NULL AND destination.address IS NOT NULL, destination.address,
    data_stream.dataset == "snort.log" AND destination.ip IS NULL AND destination.mac IS NOT NULL, destination.mac,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "snort.log" AND network.protocol IS NOT NULL AND network.protocol != "unknown", network.protocol,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "snort.log" AND rule.description IS NOT NULL, rule.description,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
