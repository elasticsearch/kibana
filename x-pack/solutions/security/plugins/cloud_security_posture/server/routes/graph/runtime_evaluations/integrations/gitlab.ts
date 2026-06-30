/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const gitlabEvaluations = {
  integration: "gitlab",
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
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset IN ("gitlab.api", "gitlab.auth", "gitlab.pages", "gitlab.production") AND source.ip IS NOT NULL, source.ip,
    data_stream.dataset IN ("gitlab.audit", "gitlab.application", "gitlab.auth") AND client.ip IS NOT NULL, client.ip,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "gitlab.audit" AND gitlab.audit.change IS NOT NULL, gitlab.audit.change,
    data_stream.dataset == "gitlab.audit", gitlab.audit.meta.caller_id,
    data_stream.dataset == "gitlab.application" AND gitlab.application.meta.root_caller_id IS NOT NULL, gitlab.application.meta.root_caller_id,
    data_stream.dataset == "gitlab.application" AND gitlab.application.meta.caller_id IS NOT NULL, gitlab.application.meta.caller_id,
    data_stream.dataset == "gitlab.auth", gitlab.auth.env,
    data_stream.dataset == "gitlab.api" AND gitlab.api.route IS NOT NULL, gitlab.api.route,
    data_stream.dataset == "gitlab.pages" AND gitlab.pages.msg IS NOT NULL, gitlab.pages.msg,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "gitlab.audit" AND gitlab.audit.meta.caller_id == "SessionsController#create", "GitLab",
    null
  ),
  user.target.id = CASE(
    user.target.id IS NOT NULL, user.target.id,
    data_stream.dataset == "gitlab.audit" AND gitlab.audit.target_type == "User" AND gitlab.audit.meta.caller_id != "SessionsController#create", TO_STRING(gitlab.audit.target_id),
    null
  ),
  user.target.name = CASE(
    user.target.name IS NOT NULL, user.target.name,
    data_stream.dataset == "gitlab.audit" AND gitlab.audit.target_type == "User" AND gitlab.audit.meta.caller_id != "SessionsController#create", gitlab.audit.target_details,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "gitlab.audit" AND gitlab.audit.target_type == "Project", TO_STRING(gitlab.audit.target_id),
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "gitlab.audit" AND gitlab.audit.target_type == "Project", gitlab.audit.target_details,
    data_stream.dataset == "gitlab.application" AND group.name IS NOT NULL, group.name,
    data_stream.dataset == "gitlab.application" AND gitlab.application.project_name IS NOT NULL, gitlab.application.project_name,
    data_stream.dataset == "gitlab.application" AND gitlab.application.meta.project IS NOT NULL, gitlab.application.meta.project,
    data_stream.dataset == "gitlab.api" AND gitlab.api.route IS NOT NULL, gitlab.api.route,
    data_stream.dataset == "gitlab.auth", url.path,
    data_stream.dataset == "gitlab.pages" AND gitlab.pages.msg == "access", gitlab.pages.uri,
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "gitlab.audit" AND gitlab.audit.target_type IS NOT NULL AND gitlab.audit.meta.caller_id != "SessionsController#create", gitlab.audit.target_type,
    data_stream.dataset == "gitlab.auth", "git_endpoint",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
