/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  agentBuilderDefaultAgentId,
  AgentType,
  AgentAccessControlMode,
  AgentAccessControlRole,
} from '@kbn/agent-builder-common';
import type { AgentCreateRequest, AgentUpdateRequest } from '../../../../../common/agents';
import type { AgentProperties } from './storage';
import type { Document } from './converters';
import { createRequestToEs, fromEs, updateRequestToEs } from './converters';

const creationDate = '2024-09-04T06:44:17.944Z';
const updateDate = '2025-08-04T06:44:19.123Z';

describe('fromEs', () => {
  const getSampleDoc = (): Document => {
    return {
      _id: '_id',
      _source: {
        id: 'id',
        name: 'name',
        type: AgentType.chat,
        space: 'space',
        description: 'description',
        labels: ['foo', 'bar'],
        avatar_color: 'blue',
        avatar_symbol: 'star',
        access_control: { access_mode: AgentAccessControlMode.Shared, entries: [] },
        created_by_id: 'user-id-1',
        created_by_name: 'test-user',
        config: {
          instructions: 'instructions',
          tools: [{ tool_ids: ['id_1', 'id_2'] }],
        },
        created_at: creationDate,
        updated_at: updateDate,
      },
    };
  };

  it('converts an agent document with new config field to its definition', () => {
    const document = getSampleDoc();

    const definition = fromEs(document);

    expect(definition).toEqual({
      type: AgentType.chat,
      id: 'id',
      name: 'name',
      configuration: {
        instructions: 'instructions',
        tools: [
          {
            tool_ids: ['id_1', 'id_2'],
          },
        ],
      },
      description: 'description',
      labels: ['foo', 'bar'],
      avatar_color: 'blue',
      avatar_symbol: 'star',
      access_control: { access_mode: AgentAccessControlMode.Shared, entries: [] },
      created_by: { id: 'user-id-1', username: 'test-user' },
    });
  });

  it('converts an agent document with legacy configuration field to its definition', () => {
    const document = getSampleDoc();
    // @ts-ignore simulating legacy document
    delete document._source.config;
    document._source!.configuration = {
      instructions: 'legacy instructions',
      tools: [{ tool_ids: ['legacy_id_1', 'legacy_id_2'] }],
    };

    const definition = fromEs(document);

    expect(definition).toEqual({
      type: AgentType.chat,
      id: 'id',
      name: 'name',
      configuration: {
        instructions: 'legacy instructions',
        tools: [
          {
            tool_ids: ['legacy_id_1', 'legacy_id_2'],
          },
        ],
      },
      description: 'description',
      labels: ['foo', 'bar'],
      avatar_color: 'blue',
      avatar_symbol: 'star',
      access_control: { access_mode: AgentAccessControlMode.Shared, entries: [] },
      created_by: { id: 'user-id-1', username: 'test-user' },
    });
  });

  it('handles legacy doc format without id field', () => {
    const document = getSampleDoc();
    document._id = '_id';
    // @ts-ignore testing edge case
    document._source!.id = undefined;

    const definition = fromEs(document);

    expect(definition.id).toEqual('_id');
  });

  it('converts skill_ids and enable_elastic_capabilities from the config', () => {
    const document = getSampleDoc();
    document._source!.config!.skill_ids = ['skill-1', 'skill-2'];
    document._source!.config!.enable_elastic_capabilities = true;

    const definition = fromEs(document);

    expect(definition.configuration.skill_ids).toEqual(['skill-1', 'skill-2']);
    expect(definition.configuration.enable_elastic_capabilities).toBe(true);
  });

  it('defaults enable_elastic_capabilities to true for default agent when missing', () => {
    const document = getSampleDoc();
    document._source!.id = agentBuilderDefaultAgentId;
    // @ts-ignore testing missing field
    delete document._source!.config!.enable_elastic_capabilities;

    const definition = fromEs(document);

    expect(definition.configuration.enable_elastic_capabilities).toBe(true);
  });

  it('defaults ownership and access control for legacy documents without new fields', () => {
    const document = getSampleDoc();
    // @ts-ignore simulating legacy document
    delete document._source.access_control;
    // @ts-ignore simulating legacy document
    delete document._source.created_by_id;
    // @ts-ignore simulating legacy document
    delete document._source.created_by_name;

    const definition = fromEs(document);

    expect(definition.access_control).toEqual({
      access_mode: AgentAccessControlMode.Public,
      entries: [],
    });
    expect(definition.created_by).toBeUndefined();
  });

  it('falls back to legacy visibility and acl entries for legacy documents', () => {
    const document = getSampleDoc();
    const source = document._source;
    if (!source) {
      throw new Error('Expected test document source');
    }
    const entries = [{ type: 'user' as const, name: 'alice', role: AgentAccessControlRole.Editor }];
    delete source.access_control;
    source.visibility = AgentAccessControlMode.Private;
    source.acl = { entries };

    const definition = fromEs(document);

    expect(definition.access_control).toEqual({
      access_mode: AgentAccessControlMode.Private,
      entries,
    });
  });

  it('prefers access_control over legacy visibility and acl fields', () => {
    const document = getSampleDoc();
    const source = document._source;
    if (!source) {
      throw new Error('Expected test document source');
    }
    const legacyEntries = [
      { type: 'user' as const, name: 'alice', role: AgentAccessControlRole.Editor },
    ];
    const accessControlEntries = [
      { type: 'user' as const, name: 'bob', role: AgentAccessControlRole.Manager },
    ];
    source.access_control = {
      access_mode: AgentAccessControlMode.Shared,
      entries: accessControlEntries,
    };
    source.visibility = AgentAccessControlMode.Private;
    source.acl = { entries: legacyEntries };

    const definition = fromEs(document);

    expect(definition.access_control).toEqual({
      access_mode: AgentAccessControlMode.Shared,
      entries: accessControlEntries,
    });
  });
});

describe('createRequestToEs', () => {
  it('converts a request to the document format using new config field', () => {
    const createRequest: AgentCreateRequest = {
      id: 'id',
      name: 'name',
      description: 'description',
      configuration: {
        instructions: 'instructions',
        tools: [
          {
            tool_ids: ['id_1', 'id_2'],
          },
        ],
      },
      labels: ['foo', 'bar'],
      avatar_color: 'green',
      avatar_symbol: 'circle',
    };

    const date = new Date();

    const docProperties = createRequestToEs({
      profile: createRequest,
      user: { id: 'user-id', username: 'test-user' },
      space: 'space-2',
      creationDate: date,
    });

    expect(docProperties).toEqual({
      type: AgentType.chat,
      id: 'id',
      name: 'name',
      space: 'space-2',
      description: 'description',
      config: {
        instructions: 'instructions',
        tools: [
          {
            tool_ids: ['id_1', 'id_2'],
          },
        ],
      },
      labels: ['foo', 'bar'],
      avatar_color: 'green',
      avatar_symbol: 'circle',
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: 'user-id',
      created_by_name: 'test-user',
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it('persists skill_ids and enable_elastic_capabilities in the config', () => {
    const createRequest: AgentCreateRequest = {
      id: 'id',
      name: 'name',
      description: 'description',
      configuration: {
        instructions: 'instructions',
        tools: [],
        skill_ids: ['skill-a', 'skill-b'],
        enable_elastic_capabilities: true,
      },
    };

    const date = new Date();

    const docProperties = createRequestToEs({
      profile: createRequest,
      user: { id: 'user-id', username: 'test-user' },
      space: 'space',
      creationDate: date,
    });

    expect(docProperties.config!.skill_ids).toEqual(['skill-a', 'skill-b']);
    expect(docProperties.config!.enable_elastic_capabilities).toBe(true);
  });

  it('persists create request access-control mode with empty entries', () => {
    const createRequest: AgentCreateRequest = {
      id: 'id',
      name: 'name',
      description: 'description',
      access_control: { access_mode: AgentAccessControlMode.Private },
      configuration: {
        instructions: 'instructions',
        tools: [],
      },
    };

    const docProperties = createRequestToEs({
      profile: createRequest,
      user: { id: 'user-id', username: 'test-user' },
      space: 'space',
      creationDate: new Date(),
    });

    expect(docProperties.access_control).toEqual({
      access_mode: AgentAccessControlMode.Private,
      entries: [],
    });
  });

  it('drops access-control entries from create requests', () => {
    const createRequest = {
      id: 'id',
      name: 'name',
      description: 'description',
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [{ type: 'user' as const, name: 'alice', role: AgentAccessControlRole.Editor }],
      },
      configuration: {
        instructions: 'instructions',
        tools: [],
      },
    } as unknown as AgentCreateRequest;

    const docProperties = createRequestToEs({
      profile: createRequest,
      user: { id: 'user-id', username: 'test-user' },
      space: 'space',
      creationDate: new Date(),
    });

    expect(docProperties.access_control).toEqual({
      access_mode: AgentAccessControlMode.Private,
      entries: [],
    });
  });
});

describe('updateRequestToEs', () => {
  it('migrates legacy document with configuration field to new config field', () => {
    const newUpdateDate = new Date();

    const agentProps: AgentProperties = {
      id: 'id',
      type: AgentType.chat,
      name: 'name',
      description: 'description',
      space: 'space',
      config: {
        instructions: 'instructions',
        tools: [
          {
            tool_ids: ['id_1', 'id_2'],
          },
        ],
      },
      configuration: {
        instructions: 'instructions',
        tools: [
          {
            tool_ids: ['id_1', 'id_2'],
          },
        ],
      },
      labels: ['foo', 'bar'],
      avatar_color: 'red',
      avatar_symbol: 'triangle',
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: 'test-user-id',
      created_by_name: 'test-user',
      created_at: creationDate,
      updated_at: updateDate,
    };

    const updateRequest: AgentUpdateRequest = {
      name: 'new name',
      configuration: {
        tools: [{ tool_ids: ['new_id_1', 'new_id_2'] }],
      },
    };

    const docProperties = updateRequestToEs({
      agentId: 'id',
      currentProps: agentProps,
      update: updateRequest,
      updateDate: newUpdateDate,
    });

    // Should use config field and omit configuration
    expect(docProperties).toEqual({
      id: 'id',
      type: AgentType.chat,
      space: 'space',
      name: 'new name',
      description: 'description',
      config: {
        instructions: 'instructions',
        tools: [
          {
            tool_ids: ['new_id_1', 'new_id_2'],
          },
        ],
      },
      labels: ['foo', 'bar'],
      avatar_color: 'red',
      avatar_symbol: 'triangle',
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: 'test-user-id',
      created_by_name: 'test-user',
      created_at: creationDate,
      updated_at: newUpdateDate.toISOString(),
    });
    // Verify configuration is not present
    expect(docProperties.configuration).toBeUndefined();
  });

  it('updates document with new config field and keeps using config', () => {
    const newUpdateDate = new Date();

    const agentProps: AgentProperties = {
      id: 'id',
      type: AgentType.chat,
      name: 'name',
      description: 'description',
      space: 'space',
      config: {
        instructions: 'instructions',
        tools: [
          {
            tool_ids: ['id_1', 'id_2'],
          },
        ],
      },
      labels: ['foo', 'bar'],
      avatar_color: 'yellow',
      avatar_symbol: 'square',
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: 'test-user-id',
      created_by_name: 'test-user',
      created_at: creationDate,
      updated_at: updateDate,
    };

    const updateRequest: AgentUpdateRequest = {
      name: 'new name',
      description: 'new description',
      configuration: {
        instructions: 'new instructions',
      },
    };

    const docProperties = updateRequestToEs({
      agentId: 'id',
      currentProps: agentProps,
      update: updateRequest,
      updateDate: newUpdateDate,
    });

    expect(docProperties).toEqual({
      id: 'id',
      type: AgentType.chat,
      space: 'space',
      name: 'new name',
      description: 'new description',
      config: {
        instructions: 'new instructions',
        tools: [
          {
            tool_ids: ['id_1', 'id_2'],
          },
        ],
      },
      labels: ['foo', 'bar'],
      avatar_color: 'yellow',
      avatar_symbol: 'square',
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: 'test-user-id',
      created_by_name: 'test-user',
      created_at: creationDate,
      updated_at: newUpdateDate.toISOString(),
    });
    expect(docProperties.configuration).toBeUndefined();
  });

  it('updates skill_ids and enable_elastic_capabilities in the config', () => {
    const newUpdateDate = new Date();

    const agentProps: AgentProperties = {
      id: 'id',
      type: AgentType.chat,
      name: 'name',
      description: 'description',
      space: 'space',
      config: {
        instructions: 'instructions',
        tools: [],
        skill_ids: ['old-skill'],
        enable_elastic_capabilities: false,
      },
      labels: [],
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: 'test-user-id',
      created_by_name: 'test-user',
      created_at: creationDate,
      updated_at: updateDate,
    };

    const updateRequest: AgentUpdateRequest = {
      configuration: {
        skill_ids: ['new-skill-1', 'new-skill-2'],
        enable_elastic_capabilities: true,
      },
    };

    const docProperties = updateRequestToEs({
      agentId: 'id',
      currentProps: agentProps,
      update: updateRequest,
      updateDate: newUpdateDate,
    });

    expect(docProperties.config!.skill_ids).toEqual(['new-skill-1', 'new-skill-2']);
    expect(docProperties.config!.enable_elastic_capabilities).toBe(true);
    expect(docProperties.config!.instructions).toBe('instructions');
  });

  it('updates access-control mode without changing entries', () => {
    const newUpdateDate = new Date();
    const entries = [{ type: 'user' as const, name: 'alice', role: AgentAccessControlRole.Editor }];

    const agentProps: AgentProperties = {
      id: 'id',
      type: AgentType.chat,
      name: 'name',
      description: 'description',
      space: 'space',
      config: {
        instructions: 'instructions',
        tools: [],
      },
      labels: [],
      access_control: { access_mode: AgentAccessControlMode.Private, entries },
      created_by_id: 'test-user-id',
      created_by_name: 'test-user',
      created_at: creationDate,
      updated_at: updateDate,
    };

    const updateRequest: AgentUpdateRequest = {
      access_control: { access_mode: AgentAccessControlMode.Shared },
    };

    const docProperties = updateRequestToEs({
      agentId: 'id',
      currentProps: agentProps,
      update: updateRequest,
      updateDate: newUpdateDate,
    });

    expect(docProperties.access_control).toEqual({
      access_mode: AgentAccessControlMode.Shared,
      entries,
    });
  });

  it('migrates legacy acl entries into access_control and drops the legacy fields', () => {
    const newUpdateDate = new Date();
    const entries = [{ type: 'user' as const, name: 'alice', role: AgentAccessControlRole.Editor }];

    const agentProps: AgentProperties = {
      id: 'id',
      type: AgentType.chat,
      name: 'name',
      description: 'description',
      space: 'space',
      config: {
        instructions: 'instructions',
        tools: [],
      },
      labels: [],
      visibility: AgentAccessControlMode.Private,
      acl: { entries },
      created_by_id: 'test-user-id',
      created_by_name: 'test-user',
      created_at: creationDate,
      updated_at: updateDate,
    };

    const updateRequest: AgentUpdateRequest = {
      access_control: { access_mode: AgentAccessControlMode.Shared },
    };

    const docProperties = updateRequestToEs({
      agentId: 'id',
      currentProps: agentProps,
      update: updateRequest,
      updateDate: newUpdateDate,
    });

    expect(docProperties.access_control).toEqual({
      access_mode: AgentAccessControlMode.Shared,
      entries,
    });
    // Legacy fields are emptied once their data has been migrated into access_control.
    expect(docProperties.visibility).toBeUndefined();
    expect(docProperties.acl).toBeUndefined();
  });

  it('drops legacy fields even when the update does not touch access control', () => {
    const newUpdateDate = new Date();
    const entries = [{ type: 'user' as const, name: 'alice', role: AgentAccessControlRole.Editor }];

    const agentProps: AgentProperties = {
      id: 'id',
      type: AgentType.chat,
      name: 'name',
      description: 'description',
      space: 'space',
      config: {
        instructions: 'instructions',
        tools: [],
      },
      labels: [],
      visibility: AgentAccessControlMode.Shared,
      acl: { entries },
      created_by_id: 'test-user-id',
      created_by_name: 'test-user',
      created_at: creationDate,
      updated_at: updateDate,
    };

    const updateRequest: AgentUpdateRequest = {
      name: 'new name',
    };

    const docProperties = updateRequestToEs({
      agentId: 'id',
      currentProps: agentProps,
      update: updateRequest,
      updateDate: newUpdateDate,
    });

    expect(docProperties.name).toBe('new name');
    // The legacy visibility/acl are normalized into access_control and removed from the doc.
    expect(docProperties.access_control).toEqual({
      access_mode: AgentAccessControlMode.Shared,
      entries,
    });
    expect(docProperties.visibility).toBeUndefined();
    expect(docProperties.acl).toBeUndefined();
  });
});
