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
import {
  accessControlUpdateToEs,
  createRequestToEs,
  fromEs,
  updateRequestToEs,
  withPermissions,
} from './converters';

const creationDate = '2024-09-04T06:44:17.944Z';
const updateDate = '2025-08-04T06:44:19.123Z';
const testUser = { id: 'editor-id', username: 'editor-user' };

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
      created_at: creationDate,
      updated_at: updateDate,
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
      created_at: creationDate,
      updated_at: updateDate,
    });
  });

  it('reads updated_by from the document', () => {
    const document = getSampleDoc();
    document._source!.updated_by_id = 'editor-id';
    document._source!.updated_by_name = 'editor-user';

    const definition = fromEs(document);

    expect(definition.updated_by).toEqual({ id: 'editor-id', username: 'editor-user' });
  });

  it('returns undefined updated_by when updated_by fields are absent', () => {
    const document = getSampleDoc();

    const definition = fromEs(document);

    expect(definition.updated_by).toBeUndefined();
  });

  it('handles legacy doc format without id field', () => {
    const document = getSampleDoc();
    document._id = '_id';
    // @ts-ignore testing edge case
    document._source!.id = undefined;

    const definition = fromEs(document);

    expect(definition.id).toEqual('_id');
  });

  it('defaults the type to chat for legacy docs without a type', () => {
    const document = getSampleDoc();
    // @ts-ignore simulating legacy document
    delete document._source!.type;

    const definition = fromEs(document);

    expect(definition.type).toEqual(AgentType.chat);
  });

  it('preserves a non-chat type', () => {
    const document = getSampleDoc();
    document._source!.type = 'investigation';

    const definition = fromEs(document);

    expect(definition.type).toEqual('investigation');
  });

  it('converts skill_ids and enable_elastic_capabilities from the config', () => {
    const document = getSampleDoc();
    document._source!.config!.skill_ids = ['skill-1', 'skill-2'];
    document._source!.config!.enable_elastic_capabilities = true;

    const definition = fromEs(document);

    expect(definition.configuration.skill_ids).toEqual(['skill-1', 'skill-2']);
    expect(definition.configuration.enable_elastic_capabilities).toBe(true);
  });

  it('converts ai_indices from the config', () => {
    const document = getSampleDoc();
    document._source!.config!.ai_indices = ['ai-index-1', 'ai-index-2'];

    const definition = fromEs(document);

    expect(definition.configuration.ai_indices).toEqual(['ai-index-1', 'ai-index-2']);
  });

  it('converts ai_indices from the legacy configuration field', () => {
    const document = getSampleDoc();
    // @ts-ignore simulating legacy document
    delete document._source.config;
    document._source!.configuration = {
      tools: [],
      ai_indices: ['ai-index-1'],
    };

    const definition = fromEs(document);

    expect(definition.configuration.ai_indices).toEqual(['ai-index-1']);
  });

  it('leaves ai_indices unset when the config does not set it', () => {
    const definition = fromEs(getSampleDoc());

    expect(definition.configuration.ai_indices).toBeUndefined();
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

describe('withPermissions', () => {
  const aliceEntry = { type: 'user' as const, name: 'alice', role: AgentAccessControlRole.Editor };
  const bobEntry = { type: 'user' as const, name: 'bob', role: AgentAccessControlRole.User };

  const getDocument = (): Required<Document> => ({
    _id: 'agent-1',
    _source: {
      id: 'agent-1',
      name: 'Agent 1',
      type: AgentType.chat,
      space: 'default',
      description: 'description',
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [aliceEntry, bobEntry],
      },
      created_by_id: 'owner-id',
      created_by_name: 'owner',
      config: {
        tools: [],
      },
      created_at: creationDate,
      updated_at: updateDate,
    },
  });

  it('adds permissions from the CurrentUser admin state', () => {
    const definition = withPermissions({
      document: getDocument(),
      user: { id: 'admin-id', username: 'admin', isAdmin: true },
    });

    expect(definition.permissions).toEqual({
      update_agent: true,
      update_access_control: true,
    });
    expect(definition.access_control?.entries).toEqual([aliceEntry, bobEntry]);
  });

  it("keeps only the caller's entry when the caller cannot manage access control", () => {
    const definition = withPermissions({
      document: getDocument(),
      user: { id: 'bob-id', username: 'bob', isAdmin: false },
    });

    expect(definition.permissions).toEqual({
      update_agent: false,
      update_access_control: false,
    });
    expect(definition.access_control?.entries).toEqual([bobEntry]);
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
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_id: 'user-id',
      created_by_name: 'test-user',
      updated_by_id: 'user-id',
      updated_by_name: 'test-user',
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

  it('persists ai_indices in the config', () => {
    const createRequest: AgentCreateRequest = {
      id: 'id',
      name: 'name',
      description: 'description',
      configuration: {
        tools: [],
        ai_indices: ['ai-index-1', 'ai-index-2'],
      },
    };

    const docProperties = createRequestToEs({
      profile: createRequest,
      user: { id: 'user-id', username: 'test-user' },
      space: 'space',
      creationDate: new Date(),
    });

    expect(docProperties.config!.ai_indices).toEqual(['ai-index-1', 'ai-index-2']);
  });

  it('defaults the type to chat and persists an explicit type', () => {
    const baseRequest: AgentCreateRequest = {
      id: 'id',
      name: 'name',
      description: 'description',
      configuration: { tools: [] },
    };
    const convert = (profile: AgentCreateRequest) =>
      createRequestToEs({
        profile,
        user: { id: 'user-id', username: 'test-user' },
        space: 'space',
        creationDate: new Date(),
      });

    expect(convert(baseRequest).type).toBe(AgentType.chat);
    expect(convert({ ...baseRequest, type: 'investigation' }).type).toBe('investigation');
  });

  it('persists create request access-control mode with empty entries', () => {
    const createRequest: AgentCreateRequest = {
      id: 'id',
      name: 'name',
      description: 'description',
      access_control: { access_mode: AgentAccessControlMode.Shared },
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
      access_mode: AgentAccessControlMode.Shared,
      entries: [],
    });
  });

  it('defaults access control to private when the create request omits it', () => {
    const createRequest: AgentCreateRequest = {
      id: 'id',
      name: 'name',
      description: 'description',
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
        entries: [{ type: 'user' as const, id: 'u_alice', role: AgentAccessControlRole.Editor }],
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
      user: testUser,
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
      updated_by_id: testUser.id,
      updated_by_name: testUser.username,
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
      user: testUser,
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
      updated_by_id: testUser.id,
      updated_by_name: testUser.username,
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
      user: testUser,
    });

    expect(docProperties.config!.skill_ids).toEqual(['new-skill-1', 'new-skill-2']);
    expect(docProperties.config!.enable_elastic_capabilities).toBe(true);
    expect(docProperties.config!.instructions).toBe('instructions');
  });

  describe('ai_indices', () => {
    const getAgentProps = (): AgentProperties => ({
      id: 'id',
      type: AgentType.chat,
      name: 'name',
      description: 'description',
      space: 'space',
      config: {
        instructions: 'instructions',
        tools: [],
        ai_indices: ['ai-index-1'],
      },
      labels: [],
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: 'test-user-id',
      created_by_name: 'test-user',
      created_at: creationDate,
      updated_at: updateDate,
    });

    const convert = (update: AgentUpdateRequest, currentProps = getAgentProps()) =>
      updateRequestToEs({
        agentId: 'id',
        currentProps,
        update,
        updateDate: new Date(),
      });

    it('replaces ai_indices when the update sets it', () => {
      const docProperties = convert({ configuration: { ai_indices: ['ai-index-2'] } });

      expect(docProperties.config!.ai_indices).toEqual(['ai-index-2']);
    });

    it('clears ai_indices when the update sets an empty list', () => {
      const docProperties = convert({ configuration: { ai_indices: [] } });

      expect(docProperties.config!.ai_indices).toEqual([]);
    });

    it('preserves stored ai_indices when the update does not mention it', () => {
      const docProperties = convert({
        name: 'new name',
        configuration: { instructions: 'new instructions' },
      });

      expect(docProperties.config!.ai_indices).toEqual(['ai-index-1']);
    });

    it('preserves stored ai_indices when the update has no configuration at all', () => {
      const docProperties = convert({ name: 'new name' });

      expect(docProperties.config!.ai_indices).toEqual(['ai-index-1']);
    });

    it('preserves ai_indices stored on a legacy configuration field', () => {
      const currentProps = getAgentProps();
      const legacyConfig = { tools: [], ai_indices: ['legacy-ai-index'] };
      // @ts-ignore simulating legacy document without the new config field
      delete currentProps.config;
      currentProps.configuration = legacyConfig;

      const docProperties = convert({ name: 'new name' }, currentProps);

      expect(docProperties.config!.ai_indices).toEqual(['legacy-ai-index']);
      expect(docProperties.configuration).toBeUndefined();
    });
  });

  it('preserves the stored type on update (type is immutable)', () => {
    const agentProps: AgentProperties = {
      id: 'id',
      type: 'investigation',
      name: 'name',
      description: 'description',
      space: 'space',
      config: { instructions: 'instructions', tools: [] },
      labels: [],
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: 'test-user-id',
      created_by_name: 'test-user',
      created_at: creationDate,
      updated_at: updateDate,
    };

    const docProperties = updateRequestToEs({
      agentId: 'id',
      currentProps: agentProps,
      update: { name: 'new name', configuration: { skill_ids: ['a-skill'] } },
      updateDate: new Date(),
      user: testUser,
    });

    expect(docProperties.type).toBe('investigation');
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
      user: testUser,
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
      user: testUser,
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
      user: testUser,
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

  it('backfills created_by_id when the owner updates a legacy agent that only stored created_by_name', () => {
    const agentProps: AgentProperties = {
      id: 'id',
      type: AgentType.chat,
      name: 'name',
      description: 'description',
      space: 'space',
      config: { tools: [] },
      labels: [],
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_name: 'legacy-owner',
      created_at: creationDate,
      updated_at: updateDate,
    };

    const docProperties = updateRequestToEs({
      agentId: 'id',
      currentProps: agentProps,
      update: { name: 'renamed' },
      updateDate: new Date(),
      user: { id: 'profile-or-realm-id', username: 'legacy-owner' },
    });

    expect(docProperties.created_by_id).toBe('profile-or-realm-id');
    expect(docProperties.created_by_name).toBe('legacy-owner');
  });

  it('does not backfill created_by_id for a non-owner updater', () => {
    const agentProps: AgentProperties = {
      id: 'id',
      type: AgentType.chat,
      name: 'name',
      description: 'description',
      space: 'space',
      config: { tools: [] },
      labels: [],
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_name: 'legacy-owner',
      created_at: creationDate,
      updated_at: updateDate,
    };

    const docProperties = updateRequestToEs({
      agentId: 'id',
      currentProps: agentProps,
      update: { name: 'renamed' },
      updateDate: new Date(),
      user: { id: 'editor-id', username: 'someone-else' },
    });

    expect(docProperties.created_by_id).toBeUndefined();
  });
});

describe('accessControlUpdateToEs', () => {
  it('sets updated_by and updated_at on access control update', () => {
    const aclUpdateDate = new Date('2025-10-01T00:00:00.000Z');
    const entries = [{ type: 'user' as const, name: 'alice', role: AgentAccessControlRole.Editor }];

    const currentProps: AgentProperties = {
      id: 'id',
      type: AgentType.chat,
      name: 'name',
      description: 'description',
      space: 'space',
      config: { instructions: 'instructions', tools: [] },
      labels: [],
      access_control: { access_mode: AgentAccessControlMode.Private, entries },
      created_by_id: 'creator-id',
      created_by_name: 'creator',
      created_at: creationDate,
      updated_at: creationDate,
    };

    const nextAccessControl = { access_mode: AgentAccessControlMode.Shared, entries };

    const result = accessControlUpdateToEs({
      currentProps,
      access_control: nextAccessControl,
      updateDate: aclUpdateDate,
      user: testUser,
    });

    expect(result.updated_by_id).toBe(testUser.id);
    expect(result.updated_by_name).toBe(testUser.username);
    expect(result.updated_at).toBe(aclUpdateDate.toISOString());
    expect(result.access_control).toEqual(nextAccessControl);
    expect(result.created_by_id).toBe('creator-id');
  });
});
