/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const microsoft_intuneEvaluations = {
  integration: "microsoft_intune",
  evaluations: [
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "microsoft_intune.audit" AND user.email IS NOT NULL, user.email,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "microsoft_intune.audit" AND event.action == "delete-devicemanagementconfigurationpolicy" AND microsoft_intune.audit.properties.target_object_ids IS NOT NULL, MV_FIRST(microsoft_intune.audit.properties.target_object_ids),
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "microsoft_intune.audit" AND event.action == "delete-devicemanagementconfigurationpolicy" AND destination.domain IS NOT NULL, MV_FIRST(destination.domain),
    data_stream.dataset == "microsoft_intune.audit" AND event.action == "create-devicemanagementconfigurationpolicyassignment" AND microsoft_intune.audit.properties.target_display_names IS NOT NULL, MV_FIRST(microsoft_intune.audit.properties.target_display_names),
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "microsoft_intune.audit", "general",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "microsoft_intune.audit" AND event.action == "delete-devicemanagementconfigurationpolicy", "intune-policy",
    data_stream.dataset == "microsoft_intune.audit" AND event.action == "create-devicemanagementconfigurationpolicyassignment", "entra-group",
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "microsoft_intune.audit", "Microsoft Intune",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
