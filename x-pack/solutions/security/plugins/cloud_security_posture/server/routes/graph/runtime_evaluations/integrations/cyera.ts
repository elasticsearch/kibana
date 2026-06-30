/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const cyeraEvaluations = {
  integration: "cyera",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.name IS NOT NULL
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
    data_stream.dataset == "cyera.event" AND cyera.event.type == "scanEvent", "general",
    data_stream.dataset == "cyera.event" AND cyera.event.type == "DisablePolicyEvent", "general",
    data_stream.dataset == "cyera.event" AND cyera.event.type == "IssueStatusChangedToClosedEvent", "general",
    data_stream.dataset == "cyera.event" AND cyera.event.type == "M365SensitivityLabelRemediationFinishedEvent", "general",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "cyera.event" AND cyera.event.type == "scanEvent", "cloud_datastore",
    data_stream.dataset == "cyera.event" AND cyera.event.type == "DisablePolicyEvent", "policy",
    data_stream.dataset == "cyera.event" AND cyera.event.type == "IssueStatusChangedToClosedEvent", "issue",
    data_stream.dataset == "cyera.event" AND cyera.event.type == "M365SensitivityLabelRemediationFinishedEvent", "m365_remediation",
    null
  )`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  service.name = CASE(
    service.name IS NOT NULL, service.name,
    data_stream.dataset == "cyera.event" AND user.name IS NULL, "Cyera",
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "cyera.event" AND cyera.event.type IS NOT NULL, cyera.event.type,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "cyera.event" AND cyera.event.type == "scanEvent", cyera.event.datastore.uid,
    data_stream.dataset == "cyera.event" AND cyera.event.type == "DisablePolicyEvent", cyera.event.policy.uid,
    data_stream.dataset == "cyera.event" AND cyera.event.type == "IssueStatusChangedToClosedEvent", cyera.event.issue.uid,
    data_stream.dataset == "cyera.event" AND cyera.event.type == "M365SensitivityLabelRemediationFinishedEvent", cyera.event.issue.uid,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "cyera.event" AND cyera.event.type == "scanEvent", cyera.event.datastore.name,
    data_stream.dataset == "cyera.event" AND cyera.event.type == "DisablePolicyEvent", cyera.event.policy.name,
    data_stream.dataset == "cyera.event" AND cyera.event.type IN ("IssueStatusChangedToClosedEvent", "M365SensitivityLabelRemediationFinishedEvent"), cyera.event.policy.name,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "cyera.event" AND cyera.event.type == "scanEvent", cloud.service.name,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
