/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const m365_defenderEvaluations = {
  integration: "m365_defender",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL OR user.domain IS NOT NULL
    OR process.name IS NOT NULL OR process.user.name IS NOT NULL OR process.user.id IS NOT NULL
    OR host.id IS NOT NULL OR host.name IS NOT NULL OR host.ip IS NOT NULL
    OR service.id IS NOT NULL OR service.name IS NOT NULL
    OR entity.id IS NOT NULL OR entity.name IS NOT NULL,
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
    data_stream.dataset == "m365_defender.event" AND application.name IS NOT NULL, "service",
    data_stream.dataset == "m365_defender.event" AND m365_defender.event.query.target IS NOT NULL, "user",
    data_stream.dataset == "m365_defender.event" AND m365_defender.event.destination.device_name IS NOT NULL, "host",
    data_stream.dataset IN ("m365_defender.alert", "m365_defender.incident") AND host.id IS NOT NULL, "host",
    data_stream.dataset == "m365_defender.event" AND email.to.address IS NOT NULL, "user",
    null
  )`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset == "m365_defender.event" AND m365_defender.event.additional_fields.SourceAccountSid IS NOT NULL, m365_defender.event.additional_fields.SourceAccountSid,
    data_stream.dataset == "m365_defender.event" AND m365_defender.event.initiating_process.account_sid IS NOT NULL, m365_defender.event.initiating_process.account_sid,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "m365_defender.event" AND m365_defender.event.initiating_process.account_name IS NOT NULL, m365_defender.event.initiating_process.account_name,
    data_stream.dataset IN ("m365_defender.alert", "m365_defender.incident") AND process.user.name IS NOT NULL, process.user.name,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "m365_defender.event" AND user.name IS NULL AND source.ip IS NOT NULL, source.ip,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "m365_defender.event" AND m365_defender.event.action.type IS NOT NULL, m365_defender.event.action.type,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  host.target.id = CASE(
    host.target.id IS NOT NULL, host.target.id,
    data_stream.dataset == "m365_defender.event" AND event.action IN ("samr-query", "dns-query") AND m365_defender.event.additional_fields.DestinationComputerObjectGuid IS NOT NULL, m365_defender.event.additional_fields.DestinationComputerObjectGuid,
    data_stream.dataset IN ("m365_defender.alert", "m365_defender.incident") AND host.id IS NOT NULL, host.id,
    data_stream.dataset == "m365_defender.event" AND event.action NOT IN ("samr-query", "dns-query", "logonsuccess", "logonfailed") AND host.id IS NOT NULL, host.id,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "m365_defender.event" AND m365_defender.event.destination.device_name IS NOT NULL, m365_defender.event.destination.device_name,
    data_stream.dataset IN ("m365_defender.alert", "m365_defender.incident") AND host.name IS NOT NULL, host.name,
    data_stream.dataset == "m365_defender.event" AND event.action NOT IN ("samr-query", "dns-query", "logonsuccess", "logonfailed") AND host.name IS NOT NULL, host.name,
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "m365_defender.event" AND destination.ip IS NOT NULL, destination.ip,
    null
  ),
  user.target.name = CASE(
    user.target.name IS NOT NULL, user.target.name,
    data_stream.dataset == "m365_defender.event" AND m365_defender.event.query.target IS NOT NULL, m365_defender.event.query.target,
    null
  ),
  user.target.email = CASE(
    user.target.email IS NOT NULL, user.target.email,
    data_stream.dataset == "m365_defender.event" AND email.to.address IS NOT NULL, email.to.address,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "m365_defender.event" AND application.name IS NOT NULL, application.name,
    data_stream.dataset == "m365_defender.alert" AND m365_defender.alert.service_source IS NOT NULL, m365_defender.alert.service_source,
    data_stream.dataset == "m365_defender.incident" AND m365_defender.incident.alert.service_source IS NOT NULL, m365_defender.incident.alert.service_source,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset IN ("m365_defender.event", "m365_defender.alert") AND file.hash.sha256 IS NOT NULL, file.hash.sha256,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
