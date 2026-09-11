/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent } from '@testing-library/react';

import { DEFAULT_DOWNLOAD_SOURCE_REFERENCE } from '../../../../../../../common/constants';

import type { AgentPolicy, NewAgentPolicy } from '../../../../types';
import { createFleetTestRendererMock } from '../../../../../../mock';

import { AgentBinaryDownloadSources } from './agent_binary_download_sources';
import { DEFAULT_SELECT_VALUE } from './hooks';

const downloadSourceOptions = [
  { value: DEFAULT_SELECT_VALUE, inputDisplay: 'Default (Elastic Artifacts)' },
  { value: 'ds-1', inputDisplay: 'Source One' },
  { value: 'ds-2', inputDisplay: 'Source Two' },
  { value: 'ds-3', inputDisplay: 'Source Three' },
];

function render(agentPolicy: Partial<NewAgentPolicy | AgentPolicy> = {}, disabled = false) {
  const renderer = createFleetTestRendererMock();
  const updateAgentPolicy = jest.fn();
  const result = renderer.render(
    <AgentBinaryDownloadSources
      agentPolicy={agentPolicy}
      updateAgentPolicy={updateAgentPolicy}
      downloadSourceOptions={downloadSourceOptions}
      isLoading={false}
      disabled={disabled}
    />
  );

  return { result, updateAgentPolicy };
}

const selectAt = (result: ReturnType<typeof render>['result'], index: number) =>
  result.getByTestId(`agentPolicyForm.downloadSource.select.${index}`);

// Mirrors the settings page, where updates are merged back into the policy and
// fed to the component again, so round-trips through getRows are exercised.
function renderStateful(initialPolicy: Partial<NewAgentPolicy | AgentPolicy> = {}) {
  const Harness = () => {
    const [policy, setPolicy] = React.useState(initialPolicy);
    return (
      <AgentBinaryDownloadSources
        agentPolicy={policy}
        updateAgentPolicy={(update) => setPolicy((prev) => ({ ...prev, ...update }))}
        downloadSourceOptions={downloadSourceOptions}
        isLoading={false}
        disabled={false}
      />
    );
  };

  return createFleetTestRendererMock().render(<Harness />);
}

describe('AgentBinaryDownloadSources', () => {
  describe('rows derived from the agent policy', () => {
    it('should render a single Default row when the policy has no download source', () => {
      const { result } = render({});

      expect(selectAt(result, 0)).toHaveTextContent('Default (Elastic Artifacts)');
      expect(result.queryByTestId('agentPolicyForm.downloadSource.select.1')).toBeNull();
    });

    it('should fall back to the legacy download_source_id when download_source_ids is unset', () => {
      const { result } = render({ download_source_id: 'ds-2' });

      expect(selectAt(result, 0)).toHaveTextContent('Source Two');
      expect(result.queryByTestId('agentPolicyForm.downloadSource.select.1')).toBeNull();
    });

    it('should render one row per entry in download_source_ids, in order', () => {
      const { result } = render({ download_source_ids: ['ds-3', 'ds-1'] });

      expect(selectAt(result, 0)).toHaveTextContent('Source Three');
      expect(selectAt(result, 1)).toHaveTextContent('Source One');
    });

    it('should display the stored default reference as the Default option', () => {
      const { result } = render({
        download_source_ids: [DEFAULT_DOWNLOAD_SOURCE_REFERENCE, 'ds-1'],
      });

      expect(selectAt(result, 0)).toHaveTextContent('Default (Elastic Artifacts)');
      expect(selectAt(result, 1)).toHaveTextContent('Source One');
    });

    it('should collapse duplicate ids so rows stay uniquely keyed', () => {
      const { result } = render({ download_source_ids: ['ds-1', 'ds-1', 'ds-2'] });

      expect(selectAt(result, 0)).toHaveTextContent('Source One');
      expect(selectAt(result, 1)).toHaveTextContent('Source Two');
      expect(result.queryByTestId('agentPolicyForm.downloadSource.select.2')).toBeNull();
    });
  });

  describe('adding and removing rows', () => {
    it('should commit immediately when adding a row so unsaved changes are detected', () => {
      const { result, updateAgentPolicy } = render({ download_source_ids: ['ds-1'] });

      fireEvent.click(result.getByTestId('agentPolicyForm.downloadSource.addServer'));

      expect(updateAgentPolicy).toHaveBeenCalledWith({
        download_source_id: 'ds-1',
        download_source_ids: ['ds-1', DEFAULT_DOWNLOAD_SOURCE_REFERENCE],
      });
    });

    it('should show a new row when adding from the initial Default-only state', () => {
      const result = renderStateful({});

      fireEvent.click(result.getByTestId('agentPolicyForm.downloadSource.addServer'));

      expect(selectAt(result, 0)).toHaveTextContent('Default (Elastic Artifacts)');
      expect(result.queryByTestId('agentPolicyForm.downloadSource.select.1')).not.toBeNull();
    });

    it('should keep adding rows up to the limit', () => {
      const result = renderStateful({});

      fireEvent.click(result.getByTestId('agentPolicyForm.downloadSource.addServer'));
      fireEvent.click(result.getByTestId('agentPolicyForm.downloadSource.addServer'));

      expect(result.queryByTestId('agentPolicyForm.downloadSource.select.2')).not.toBeNull();
      expect(result.getByTestId('agentPolicyForm.downloadSource.addServer')).toBeDisabled();
    });

    it('should drop a removed row from the rendered list', () => {
      const result = renderStateful({ download_source_ids: ['ds-1', 'ds-2'] });

      fireEvent.click(result.getByTestId('agentPolicyForm.downloadSource.remove.1'));

      expect(selectAt(result, 0)).toHaveTextContent('Source One');
      expect(result.queryByTestId('agentPolicyForm.downloadSource.select.1')).toBeNull();
    });

    it('should remove the row at the clicked index', () => {
      const { result, updateAgentPolicy } = render({
        download_source_ids: ['ds-1', 'ds-2', 'ds-3'],
      });

      fireEvent.click(result.getByTestId('agentPolicyForm.downloadSource.remove.1'));

      expect(updateAgentPolicy).toHaveBeenCalledWith({
        download_source_id: 'ds-1',
        download_source_ids: ['ds-1', 'ds-3'],
      });
    });

    it('should not offer to remove the first row', () => {
      const { result } = render({ download_source_ids: ['ds-1', 'ds-2'] });

      expect(result.queryByTestId('agentPolicyForm.downloadSource.remove.0')).toBeNull();
      expect(result.queryByTestId('agentPolicyForm.downloadSource.remove.1')).not.toBeNull();
    });
  });

  describe('limit enforcement', () => {
    it('should disable adding and show the limit message at three sources', () => {
      const { result } = render({ download_source_ids: ['ds-1', 'ds-2', 'ds-3'] });

      expect(result.getByTestId('agentPolicyForm.downloadSource.addServer')).toBeDisabled();
      expect(result.container).toHaveTextContent('You have reached the limit of selected servers.');
    });

    it('should disable adding when every source is already in the list', () => {
      const renderer = createFleetTestRendererMock();
      const result = renderer.render(
        <AgentBinaryDownloadSources
          agentPolicy={{ download_source_ids: ['ds-1'] }}
          updateAgentPolicy={jest.fn()}
          downloadSourceOptions={[{ value: 'ds-1', inputDisplay: 'Source One' }]}
          isLoading={false}
          disabled={false}
        />
      );

      expect(result.getByTestId('agentPolicyForm.downloadSource.addServer')).toBeDisabled();
    });

    it('should allow adding below the limit', () => {
      const { result } = render({ download_source_ids: ['ds-1', 'ds-2'] });

      expect(result.getByTestId('agentPolicyForm.downloadSource.addServer')).not.toBeDisabled();
      expect(result.container).not.toHaveTextContent(
        'You have reached the limit of selected servers.'
      );
    });
  });

  describe('default reference mapping', () => {
    it('should store the default reference and null the legacy field when Default is picked', () => {
      const { result, updateAgentPolicy } = render({ download_source_ids: ['ds-1'] });

      fireEvent.click(selectAt(result, 0));
      fireEvent.click(result.getByRole('option', { name: 'Default (Elastic Artifacts)' }));

      expect(updateAgentPolicy).toHaveBeenCalledWith({
        download_source_id: null,
        download_source_ids: [DEFAULT_DOWNLOAD_SOURCE_REFERENCE],
      });
    });

    it('should keep the legacy field in sync with a concrete primary source', () => {
      const { result, updateAgentPolicy } = render({
        download_source_ids: [DEFAULT_DOWNLOAD_SOURCE_REFERENCE],
      });

      fireEvent.click(selectAt(result, 0));
      fireEvent.click(result.getByRole('option', { name: 'Source Two' }));

      expect(updateAgentPolicy).toHaveBeenCalledWith({
        download_source_id: 'ds-2',
        download_source_ids: ['ds-2'],
      });
    });

    it('should null the legacy field when Default leads a multi-source list', () => {
      const { result, updateAgentPolicy } = render({
        download_source_ids: ['ds-1', 'ds-2'],
      });

      fireEvent.click(selectAt(result, 0));
      fireEvent.click(result.getByRole('option', { name: 'Default (Elastic Artifacts)' }));

      expect(updateAgentPolicy).toHaveBeenCalledWith({
        download_source_id: null,
        download_source_ids: [DEFAULT_DOWNLOAD_SOURCE_REFERENCE, 'ds-2'],
      });
    });
  });

  describe('duplicate prevention', () => {
    it('should disable sources already chosen in another row', () => {
      const { result } = render({ download_source_ids: ['ds-1', 'ds-2'] });

      fireEvent.click(selectAt(result, 0));

      expect(result.getByRole('option', { name: 'Source Two' })).toBeDisabled();
      expect(result.getByRole('option', { name: 'Source Three' })).not.toBeDisabled();
    });

    it('should keep the row own value selectable', () => {
      const { result } = render({ download_source_ids: ['ds-1', 'ds-2'] });

      fireEvent.click(selectAt(result, 0));

      expect(result.getByRole('option', { name: 'Source One' })).not.toBeDisabled();
    });
  });

  it('should disable every control when the form is disabled', () => {
    const { result } = render({ download_source_ids: ['ds-1', 'ds-2'] }, true);

    expect(selectAt(result, 0)).toBeDisabled();
    expect(result.getByTestId('agentPolicyForm.downloadSource.remove.1')).toBeDisabled();
    expect(result.getByTestId('agentPolicyForm.downloadSource.addServer')).toBeDisabled();
  });
});
