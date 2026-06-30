/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const openaiEvaluations = {
  integration: "openai",
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
    data_stream.dataset IN ("openai.completions", "openai.embeddings", "openai.moderations", "openai.images", "openai.audio_transcriptions", "openai.audio_speeches") AND openai.base.user_id IS NOT NULL, openai.base.user_id,
    null
  ),
  entity.id = CASE(
    entity.id IS NOT NULL, entity.id,
    data_stream.dataset IN ("openai.completions", "openai.embeddings", "openai.moderations", "openai.images", "openai.audio_transcriptions", "openai.audio_speeches") AND openai.base.api_key_id IS NOT NULL, openai.base.api_key_id,
    data_stream.dataset IN ("openai.vector_stores", "openai.code_interpreter_sessions") AND openai.base.project_id IS NOT NULL AND openai.base.project_id != "", openai.base.project_id,
    null
  ),
  entity.type = CASE(
    entity.type IS NOT NULL, entity.type,
    data_stream.dataset IN ("openai.completions", "openai.embeddings", "openai.moderations", "openai.images", "openai.audio_transcriptions", "openai.audio_speeches") AND openai.base.api_key_id IS NOT NULL, "api_key",
    data_stream.dataset IN ("openai.vector_stores", "openai.code_interpreter_sessions"), "project",
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "openai.images" AND openai.images.source IS NOT NULL, openai.images.source,
    data_stream.dataset == "openai.completions", "completions",
    data_stream.dataset == "openai.embeddings", "embeddings",
    data_stream.dataset == "openai.moderations", "moderations",
    data_stream.dataset == "openai.images", "images",
    data_stream.dataset == "openai.audio_transcriptions", "audio_transcriptions",
    data_stream.dataset == "openai.audio_speeches", "audio_speeches",
    data_stream.dataset == "openai.vector_stores", "vector_stores",
    data_stream.dataset == "openai.code_interpreter_sessions", "code_interpreter_sessions",
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset IN ("openai.completions", "openai.embeddings", "openai.moderations", "openai.images", "openai.audio_transcriptions", "openai.audio_speeches") AND openai.base.model IS NOT NULL, openai.base.model,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset IN ("openai.completions", "openai.embeddings", "openai.moderations", "openai.images", "openai.audio_transcriptions", "openai.audio_speeches") AND openai.base.model IS NOT NULL, openai.base.model,
    data_stream.dataset IN ("openai.completions", "openai.embeddings", "openai.moderations", "openai.images", "openai.audio_transcriptions", "openai.audio_speeches", "openai.vector_stores", "openai.code_interpreter_sessions"), "OpenAI API",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "openai.vector_stores", "vector_store",
    data_stream.dataset == "openai.code_interpreter_sessions", "code_interpreter_session",
    data_stream.dataset IN ("openai.completions", "openai.embeddings", "openai.moderations", "openai.images", "openai.audio_transcriptions", "openai.audio_speeches") AND openai.base.model IS NOT NULL, "foundation_model",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
