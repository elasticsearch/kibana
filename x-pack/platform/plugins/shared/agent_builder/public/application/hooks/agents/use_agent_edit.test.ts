/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import { AgentAccessControlRole, AgentAccessControlMode } from '@kbn/agent-builder-common';
import { useAgentEdit, type AgentEditState } from './use_agent_edit';

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateAccessControl = jest.fn();
type MockAgent = AgentEditState & {
  permissions?: { update_agent: boolean; update_access_control: boolean };
};
let mockAgent: MockAgent | undefined;

jest.mock('@kbn/react-query', () => ({
  // Run the mutationFn directly so the payload passed to the service is observable.
  useMutation: (options: { mutationFn: (data: unknown) => Promise<unknown> }) => ({
    mutateAsync: options.mutationFn,
    isLoading: false,
  }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('react-router-dom-v5-compat', () => ({
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

jest.mock('../use_agent_builder_service', () => ({
  useAgentBuilderServices: () => ({
    agentService: {
      create: mockCreate,
      update: mockUpdate,
      updateAccessControl: mockUpdateAccessControl,
    },
  }),
}));

jest.mock('./use_agent_by_id', () => ({
  useAgentBuilderAgentById: () => ({ agent: mockAgent, isLoading: false, error: undefined }),
}));

jest.mock('../tools/use_tools', () => ({
  useToolsService: () => ({ tools: [], isLoading: false, error: undefined }),
}));

jest.mock('../skills/use_skills', () => ({
  useSkillsService: () => ({ skills: [], isLoading: false, error: undefined }),
}));

jest.mock('../plugins/use_plugins', () => ({
  usePluginsService: () => ({ plugins: [], isLoading: false, error: undefined }),
}));

jest.mock('../use_experimental_features', () => ({
  useExperimentalFeatures: () => false,
}));

const baseConfiguration: AgentEditState['configuration'] = {
  instructions: '',
  tools: [{ tool_ids: ['*'] }],
  enable_elastic_capabilities: false,
  workflow_ids: [],
  plugin_ids: [],
};

describe('useAgentEdit submit (create/clone branch)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgent = undefined;
    mockCreate.mockResolvedValue({ id: 'cloned-agent' });
    mockUpdate.mockResolvedValue({ id: 'existing-agent' });
    mockUpdateAccessControl.mockResolvedValue({
      access_mode: AgentAccessControlMode.Private,
      entries: [],
    });
  });

  it('strips access control entries, created_by and avatar_icon from the create payload when cloning', async () => {
    const cloneData: AgentEditState = {
      id: 'cloned-agent',
      name: 'Cloned Agent',
      description: 'A clone of an existing agent',
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [{ type: 'user', name: 'alice', role: AgentAccessControlRole.Editor }],
      },
      labels: ['support'],
      avatar_color: '#FFFFFF',
      avatar_symbol: 'CA',
      avatar_icon: 'logoElastic',
      created_by: { id: 'u1', username: 'bob' },
      configuration: baseConfiguration,
    };

    const { result } = renderHook(() =>
      useAgentEdit({ onSaveSuccess: jest.fn(), onSaveError: jest.fn() })
    );

    await act(async () => {
      await result.current.submit(cloneData);
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = mockCreate.mock.calls[0][0];
    expect(payload).not.toHaveProperty('created_by');
    expect(payload).not.toHaveProperty('avatar_icon');
    expect(payload).toMatchObject({
      id: 'cloned-agent',
      name: 'Cloned Agent',
      description: 'A clone of an existing agent',
      access_control: { access_mode: AgentAccessControlMode.Private },
      labels: ['support'],
      avatar_color: '#FFFFFF',
      avatar_symbol: 'CA',
    });
    expect(payload.access_control).not.toHaveProperty('entries');
  });

  it('preserves the standard create fields for a brand-new agent', async () => {
    const newData: AgentEditState = {
      id: 'new-agent',
      name: 'New Agent',
      description: 'A new agent',
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      labels: [],
      avatar_color: '',
      avatar_symbol: '',
      configuration: baseConfiguration,
    };

    const { result } = renderHook(() =>
      useAgentEdit({ onSaveSuccess: jest.fn(), onSaveError: jest.fn() })
    );

    await act(async () => {
      await result.current.submit(newData);
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      id: 'new-agent',
      name: 'New Agent',
      access_control: { access_mode: AgentAccessControlMode.Private },
    });
    expect(mockCreate.mock.calls[0][0].access_control).not.toHaveProperty('entries');
  });

  it('strips access control entries from regular update payloads', async () => {
    const updateData: AgentEditState = {
      id: 'existing-agent',
      name: 'Existing Agent',
      description: 'An existing agent',
      access_control: {
        access_mode: AgentAccessControlMode.Shared,
        entries: [{ type: 'user', name: 'alice', role: AgentAccessControlRole.Editor }],
      },
      labels: [],
      avatar_color: '',
      avatar_symbol: '',
      configuration: baseConfiguration,
    };

    const { result } = renderHook(() =>
      useAgentEdit({
        editingAgentId: 'existing-agent',
        onSaveSuccess: jest.fn(),
        onSaveError: jest.fn(),
      })
    );

    await act(async () => {
      await result.current.submit(updateData);
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const payload = mockUpdate.mock.calls[0][1];
    expect(payload).toMatchObject({
      access_control: { access_mode: AgentAccessControlMode.Shared },
    });
    expect(payload.access_control).not.toHaveProperty('entries');
    expect(mockUpdateAccessControl).not.toHaveBeenCalled();
  });

  it('updates access control entries separately from regular update payloads', async () => {
    mockAgent = {
      id: 'existing-agent',
      name: 'Existing Agent',
      description: 'An existing agent',
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [
          { type: 'user', name: 'bob', role: AgentAccessControlRole.User },
          { type: 'user', name: 'alice', role: AgentAccessControlRole.Editor },
        ],
      },
      labels: [],
      avatar_color: '',
      avatar_symbol: '',
      configuration: baseConfiguration,
    };

    const updateData: AgentEditState = {
      ...mockAgent,
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [{ type: 'user', name: 'alice', role: AgentAccessControlRole.Editor }],
      },
    };

    const { result } = renderHook(() =>
      useAgentEdit({
        editingAgentId: 'existing-agent',
        onSaveSuccess: jest.fn(),
        onSaveError: jest.fn(),
      })
    );

    await act(async () => {
      await result.current.submit(updateData);
    });

    expect(mockUpdateAccessControl).toHaveBeenCalledTimes(1);
    expect(mockUpdateAccessControl).toHaveBeenCalledWith('existing-agent', {
      entries: [{ type: 'user', name: 'alice', role: AgentAccessControlRole.Editor }],
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpdateAccessControl.mock.invocationCallOrder[0]
    );
    expect(mockUpdate.mock.calls[0][1].access_control).toEqual({
      access_mode: AgentAccessControlMode.Private,
    });
    expect(mockUpdate.mock.calls[0][1].access_control).not.toHaveProperty('entries');
  });

  it('exposes permissions separately from editable form state', async () => {
    mockAgent = {
      id: 'existing-agent',
      name: 'Existing Agent',
      description: 'An existing agent',
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      labels: [],
      avatar_color: '',
      avatar_symbol: '',
      configuration: baseConfiguration,
      permissions: { update_agent: true, update_access_control: false },
    };

    const { result } = renderHook(() =>
      useAgentEdit({
        editingAgentId: 'existing-agent',
        onSaveSuccess: jest.fn(),
        onSaveError: jest.fn(),
      })
    );

    expect(result.current.permissions).toEqual({
      update_agent: true,
      update_access_control: false,
    });
    expect(result.current.state).not.toHaveProperty('permissions');
  });
});
