/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const snykEvaluations = {
  integration: "snyk",
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
      id: "optional_classification",
      section: "Optional classification helpers (when needed)",
      esql: `| EVAL
  entity.type = CASE(
    entity.type IS NOT NULL, entity.type,
    data_stream.dataset == "snyk.audit_logs" AND user.id IS NULL, "service",
    data_stream.dataset == "snyk.issues", "service",
    null
  ),
  entity.sub_type = CASE(
    entity.sub_type IS NOT NULL, entity.sub_type,
    data_stream.dataset == "snyk.audit_logs" AND user.id IS NULL, "Snyk platform worker",
    data_stream.dataset == "snyk.issues", "Snyk scanner",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "snyk.issues", snyk.issues.attributes.type,
    data_stream.dataset == "snyk.audit_logs" AND snyk.audit_logs.project_id IS NOT NULL, "project",
    data_stream.dataset == "snyk.audit_logs" AND event.action == "org.target.create", "target",
    data_stream.dataset == "snyk.audit_logs" AND event.action == "group.service_account.create", "service_account",
    null
  )`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  service.name = CASE(
    service.name IS NOT NULL, service.name,
    data_stream.dataset == "snyk.audit_logs" AND user.id IS NULL, "Snyk",
    data_stream.dataset == "snyk.issues", "Snyk",
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  user.target.email = CASE(
    user.target.email IS NOT NULL, user.target.email,
    data_stream.dataset == "snyk.audit_logs" AND event.action == "org.user.invite", snyk.audit_logs.content.email,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "snyk.audit_logs" AND snyk.audit_logs.project_id IS NOT NULL, snyk.audit_logs.project_id,
    data_stream.dataset == "snyk.audit_logs" AND event.action == "org.target.create", snyk.audit_logs.content.targetId,
    data_stream.dataset == "snyk.audit_logs" AND event.action == "group.service_account.create", snyk.audit_logs.content.serviceAccountPublicId,
    data_stream.dataset == "snyk.issues", snyk.issues.id,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "snyk.issues", snyk.issues.attributes.title,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
