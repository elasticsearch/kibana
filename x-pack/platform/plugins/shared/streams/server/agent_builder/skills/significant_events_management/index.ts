/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import {
  STREAMS_CREATE_EVENT_TOOL_ID,
  STREAMS_EVENT_STATUS_UPDATE_TOOL_ID,
  STREAMS_SEARCH_EVENTS_TOOL_ID,
} from '../../tools/register_tools';
import description from './description.text';
import content from './skill.md.text';

export const sigEventsManagementSkill = defineSkillType({
  id: 'significant-events-management',
  name: 'significant-events-management',
  basePath: 'skills/platform/streams',
  description,
  content,
  getRegistryTools: () => [
    STREAMS_SEARCH_EVENTS_TOOL_ID,
    STREAMS_CREATE_EVENT_TOOL_ID,
    STREAMS_EVENT_STATUS_UPDATE_TOOL_ID,
  ],
});
