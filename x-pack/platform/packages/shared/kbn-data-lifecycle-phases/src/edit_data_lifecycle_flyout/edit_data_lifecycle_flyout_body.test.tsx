/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { EuiFieldText, EuiThemeProvider } from '@elastic/eui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SerializedPolicy } from '@kbn/index-lifecycle-management-common-shared';
import { EditDataLifecycleFlyoutBody } from './edit_data_lifecycle_flyout_body';

const POLICY_WITH_DOWNSAMPLE: SerializedPolicy = {
  name: '.alerts-ilm-policy',
  phases: {
    hot: { min_age: '0ms', actions: {} },
    warm: { min_age: '7d', actions: { downsample: { fixed_interval: '1h' } } },
    delete: { min_age: '60d', actions: { delete: {} } },
  },
};

describe('EditDataLifecycleFlyoutBody', () => {
  const rowTestSubj = (name: string) =>
    `retentionSelectableRow-${name.replace(/[^a-zA-Z0-9]+/g, '_')}`;
  const inspectTestSubj = (name: string) =>
    `retentionSelectableRowInspect-${name.replace(/[^a-zA-Z0-9]+/g, '_')}`;

  const renderWithTheme = (node: React.ReactElement) =>
    render(node, {
      wrapper: EuiThemeProvider,
    });

  it('disables the policy search and inspect actions when inheriting lifecycle', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const onInspect = jest.fn();

    renderWithTheme(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {} }}
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{
          policies: [
            {
              name: POLICY_WITH_DOWNSAMPLE.name,
              phases: POLICY_WITH_DOWNSAMPLE.phases,
              serializedPolicy: POLICY_WITH_DOWNSAMPLE,
            },
          ],
          selectedPolicyName: POLICY_WITH_DOWNSAMPLE.name,
          onSelect,
          onInspect,
        }}
      />
    );

    expect(screen.queryByTestId('retentionSelectorSearchInput')).not.toBeInTheDocument();

    expect(screen.queryByTestId(inspectTestSubj('.alerts-ilm-policy'))).not.toBeInTheDocument();

    // Verify the inherited policy row is present
    expect(screen.getByTestId(rowTestSubj('.alerts-ilm-policy'))).toBeInTheDocument();

    // Click should have no effect (row is read-only)
    await user.click(screen.getByTestId(rowTestSubj('.alerts-ilm-policy')));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onInspect).not.toHaveBeenCalled();
  });

  it('renders the DLM content and allows the consumer to disable it when inheriting lifecycle', () => {
    const inheritLifecycle = true;

    renderWithTheme(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: inheritLifecycle, onChange: () => {} }}
        method={{ value: 'dlm', onChange: () => {} }}
        ilm={{ policies: [], onSelect: () => {}, onInspect: () => {} }}
        dataStreamLifecycleContent={
          <EuiFieldText
            data-test-subj="editDataLifecycle-dlmRetentionInput"
            fullWidth
            disabled={inheritLifecycle}
            defaultValue="30d"
          />
        }
      />
    );

    expect(screen.getByTestId('editDataLifecycle-dlmRetentionInput')).toBeDisabled();
  });

  it('pins the initially selected policy name at the top', () => {
    const policies = [
      { name: 'policy-b', phases: {}, serializedPolicy: undefined },
      { name: 'policy-a', phases: {}, serializedPolicy: undefined },
    ];

    renderWithTheme(
      <EditDataLifecycleFlyoutBody
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{
          policies,
          selectedPolicyName: 'policy-a',
          onSelect: () => {},
        }}
      />
    );

    const listItems = screen.getAllByRole('listitem');
    const listItemText = listItems.map((el) => el.textContent ?? '');
    const policyAIdx = listItemText.findIndex((t) => t.includes('policy-a'));
    const policyBIdx = listItemText.findIndex((t) => t.includes('policy-b'));
    expect(policyAIdx).toBeGreaterThanOrEqual(0);
    expect(policyBIdx).toBeGreaterThanOrEqual(0);
    expect(policyAIdx).toBeLessThan(policyBIdx);
  });

  it('does not pin a policy selected after the flyout opens', () => {
    const policies = [
      { name: 'policy-b', phases: {}, serializedPolicy: undefined },
      { name: 'policy-a', phases: {}, serializedPolicy: undefined },
    ];

    const { rerender } = renderWithTheme(
      <EditDataLifecycleFlyoutBody
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{
          policies,
          selectedPolicyName: undefined,
          onSelect: () => {},
        }}
      />
    );

    rerender(
      <EditDataLifecycleFlyoutBody
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{
          policies,
          selectedPolicyName: undefined,
          onSelect: () => {},
        }}
      />
    );

    rerender(
      <EditDataLifecycleFlyoutBody
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{
          policies,
          selectedPolicyName: 'policy-a',
          onSelect: () => {},
        }}
      />
    );

    const listItems = screen.getAllByRole('listitem');
    const listItemText = listItems.map((el) => el.textContent ?? '');
    const policyAIdx = listItemText.findIndex((t) => t.includes('policy-a'));
    const policyBIdx = listItemText.findIndex((t) => t.includes('policy-b'));
    expect(policyAIdx).toBeGreaterThanOrEqual(0);
    expect(policyBIdx).toBeGreaterThanOrEqual(0);
    expect(policyBIdx).toBeLessThan(policyAIdx);
  });

  it('renders the inherited lifecycle method the consumer provides when inheriting', () => {
    const inheritLifecycle = true;

    renderWithTheme(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: inheritLifecycle, onChange: () => {} }}
        // The consumer feeds the resolved inherited method (DLM here).
        method={{ value: 'dlm', onChange: () => {} }}
        ilm={{ policies: [], onSelect: () => {}, onInspect: () => {} }}
        dataStreamLifecycleContent={
          <EuiFieldText
            data-test-subj="editDataLifecycle-dlmRetentionInput"
            fullWidth
            disabled={inheritLifecycle}
            defaultValue="30d"
          />
        }
      />
    );

    // Inherited method is DLM, so DLM content should be shown and ILM panels should not.
    expect(screen.getByTestId('editDataLifecycle-dlmRetentionInput')).toBeInTheDocument();
    expect(
      screen.queryByTestId('editDataLifecycle-noInheritedPolicyPanel')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('editDataLifecycle-ilmNotConfiguredPanel')).not.toBeInTheDocument();
  });

  it('renders the inherited ILM policy the consumer provides while inheriting', () => {
    const policies = [
      { name: 'policy-a', phases: {}, serializedPolicy: undefined },
      { name: 'policy-b', phases: {}, serializedPolicy: undefined },
    ];

    // The consumer owns the inherited value: while inheriting it feeds either
    // `undefined` (until resolved) or exactly the inherited policy. The body
    // renders that policy directly and only shows the single inherited row.
    const { rerender } = renderWithTheme(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {} }}
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{
          policies,
          selectedPolicyName: 'policy-a',
          onSelect: () => {},
        }}
      />
    );

    expect(screen.getByTestId(rowTestSubj('policy-a'))).toBeInTheDocument();
    expect(screen.queryByTestId(rowTestSubj('policy-b'))).not.toBeInTheDocument();

    // When the consumer updates the inherited policy, the body reflects it.
    rerender(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {} }}
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{
          policies,
          selectedPolicyName: 'policy-b',
          onSelect: () => {},
        }}
      />
    );

    expect(screen.getByTestId(rowTestSubj('policy-b'))).toBeInTheDocument();
    expect(screen.queryByTestId(rowTestSubj('policy-a'))).not.toBeInTheDocument();
  });

  it('renders the DLM content the consumer provides while inheriting', () => {
    const { rerender } = renderWithTheme(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {} }}
        method={{ value: 'dlm', onChange: () => {} }}
        ilm={{ policies: [], onSelect: () => {} }}
        dataStreamLifecycleContent={<div data-test-subj="dlmContentValue">inherited</div>}
      />
    );

    expect(screen.getByTestId('dlmContentValue')).toHaveTextContent('inherited');

    // The consumer owns the value; when it updates, the body reflects it.
    rerender(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {} }}
        method={{ value: 'dlm', onChange: () => {} }}
        ilm={{ policies: [], onSelect: () => {} }}
        dataStreamLifecycleContent={<div data-test-subj="dlmContentValue">local</div>}
      />
    );

    expect(screen.getByTestId('dlmContentValue')).toHaveTextContent('local');
  });

  it('renders the inherited policy the consumer resolves after toggling inheritance on', () => {
    const policies = [
      { name: 'policy-a', phases: {}, serializedPolicy: undefined },
      { name: 'policy-b', phases: {}, serializedPolicy: undefined },
    ];

    // Inheritance toggled on; consumer has not resolved the inherited policy yet
    // (it feeds `undefined` until the source resolves).
    const { rerender } = renderWithTheme(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {} }}
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{ policies, selectedPolicyName: undefined, onSelect: () => {} }}
      />
    );

    // Inherited source resolves and the consumer feeds the inherited policy.
    rerender(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {} }}
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{ policies, selectedPolicyName: 'policy-a', onSelect: () => {} }}
      />
    );

    // The inherited policy is shown read-only (no search input) even when it
    // equals a value the user could have selected before toggling — the
    // consumer drives the value, so there is no pin/deadlock to manage here.
    expect(screen.getByTestId(rowTestSubj('policy-a'))).toBeInTheDocument();
    expect(screen.queryByTestId('retentionSelectorSearchInput')).not.toBeInTheDocument();
  });

  it('resets uncontrolled DLM input back to inherited value when re-enabling inherit', async () => {
    const user = userEvent.setup();

    const renderContent = (inheritLifecycle: boolean) => (
      <input
        data-test-subj="dlmUncontrolledInput"
        defaultValue="inherited"
        disabled={inheritLifecycle}
      />
    );

    const { rerender } = renderWithTheme(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {} }}
        method={{ value: 'dlm', onChange: () => {} }}
        ilm={{ policies: [], onSelect: () => {} }}
        dataStreamLifecycleContent={renderContent(true)}
      />
    );

    // Switch to non-inherited mode and edit the uncontrolled input.
    rerender(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: false, onChange: () => {} }}
        method={{ value: 'dlm', onChange: () => {} }}
        ilm={{ policies: [], onSelect: () => {} }}
        dataStreamLifecycleContent={renderContent(false)}
      />
    );

    const input = screen.getByTestId('dlmUncontrolledInput') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'local');
    expect(input.value).toBe('local');

    // Re-enable inheritance: should show the inherited default again.
    rerender(
      <EditDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {} }}
        method={{ value: 'dlm', onChange: () => {} }}
        ilm={{ policies: [], onSelect: () => {} }}
        dataStreamLifecycleContent={renderContent(true)}
      />
    );

    expect((screen.getByTestId('dlmUncontrolledInput') as HTMLInputElement).value).toBe(
      'inherited'
    );
  });
});
