/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { streamsManagementSkill } from './streams_management_skill';
import {
  STREAMS_READ_TOOL_IDS,
  STREAMS_WRITE_TOOL_IDS,
  STREAMS_INSPECT_STREAMS_TOOL_ID,
  STREAMS_DIAGNOSE_STREAM_TOOL_ID,
  STREAMS_QUERY_DOCUMENTS_TOOL_ID,
  STREAMS_DESIGN_PIPELINE_TOOL_ID,
  STREAMS_LIST_ILM_POLICIES_TOOL_ID,
  STREAMS_UPDATE_STREAM_TOOL_ID,
  STREAMS_CREATE_PARTITION_TOOL_ID,
  STREAMS_DELETE_STREAM_TOOL_ID,
} from '../tools/tool_ids';

describe('streamsManagementSkill', () => {
  it('has the expected id and name', () => {
    expect(streamsManagementSkill.id).toBe('streams-management');
    expect(streamsManagementSkill.name).toBe('streams-management');
  });

  it('returns all read and write tool IDs from getRegistryTools', async () => {
    const toolIds = await streamsManagementSkill.getRegistryTools!();
    expect(toolIds).toEqual([...STREAMS_READ_TOOL_IDS, ...STREAMS_WRITE_TOOL_IDS]);
  });

  it('does not include sig events tools in getRegistryTools', async () => {
    const toolIds = await streamsManagementSkill.getRegistryTools!();
    expect(toolIds.every((id: string) => !id.includes('significant_events'))).toBe(true);
    expect(toolIds.every((id: string) => !id.includes('ki_search'))).toBe(true);
  });

  describe('skill content references all registered tool IDs in <tool_selection>', () => {
    const { content } = streamsManagementSkill;

    const allToolIds = [
      STREAMS_INSPECT_STREAMS_TOOL_ID,
      STREAMS_DIAGNOSE_STREAM_TOOL_ID,
      STREAMS_QUERY_DOCUMENTS_TOOL_ID,
      STREAMS_DESIGN_PIPELINE_TOOL_ID,
      STREAMS_LIST_ILM_POLICIES_TOOL_ID,
      STREAMS_UPDATE_STREAM_TOOL_ID,
      STREAMS_CREATE_PARTITION_TOOL_ID,
      STREAMS_DELETE_STREAM_TOOL_ID,
    ];

    for (const toolId of allToolIds) {
      it(`references ${toolId}`, () => {
        expect(content).toContain(toolId);
      });
    }
  });

  it('contains key behavioral sections', () => {
    const { content } = streamsManagementSkill;
    expect(content).toContain('<tool_selection>');
    expect(content).toContain('<efficiency>');
    expect(content).toContain('<remediation_workflows>');
    expect(content).toContain('<temporal_behavior>');
    expect(content).toContain('<boundaries>');
  });

  it('has a non-empty description mentioning streams', () => {
    expect(streamsManagementSkill.description).toBeTruthy();
    expect(streamsManagementSkill.description).toContain('streams');
  });
});
