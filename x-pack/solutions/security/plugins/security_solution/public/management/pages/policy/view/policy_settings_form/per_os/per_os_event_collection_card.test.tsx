/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { RenderResult } from '@testing-library/react';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cloneDeep } from 'lodash';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import { expectIsViewOnly, getPolicySettingsFormTestSubjects } from '../mocks';
import type { PerOsEventCollectionCardProps } from './per_os_event_collection_card';
import { PerOsEventCollectionCard } from './per_os_event_collection_card';

describe('PerOsEventCollectionCard', () => {
  const testSubj = getPolicySettingsFormTestSubjects('test').perOsEventCollection;
  let policy: PolicyConfig;
  let props: PerOsEventCollectionCardProps;
  let mockedContext: AppContextTestRender;
  let renderResult: RenderResult;

  const render = () => {
    renderResult = mockedContext.render(<PerOsEventCollectionCard {...props} policy={policy} />);
    return renderResult;
  };

  const getUpdatedPolicy = (): PolicyConfig => {
    const onChange = props.onChange as jest.Mock;
    return onChange.mock.calls[onChange.mock.calls.length - 1][0].updatedPolicy;
  };

  beforeEach(() => {
    mockedContext = createAppRootMockRenderer();
    mockedContext.setExperimentalFlag({ linuxDnsEvents: true });
    policy = new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
      .config.policy.value;
    props = {
      policy,
      onChange: jest.fn(),
      mode: 'edit',
      'data-test-subj': testSubj.card,
    };
  });

  it('renders exactly three accessibly grouped rows labelled from the OS titles', () => {
    render();
    const card = within(renderResult.getByTestId(testSubj.card));

    // Three OS fieldsets plus the Linux session-data group, which is its own accessible
    // group because it lives in the row's full-width panel slot rather than beside the
    // checkboxes.
    expect(card.getAllByRole('group')).toHaveLength(4);
    expect(renderResult.getByTestId(testSubj.windows.row)).toHaveTextContent('Windows');
    expect(renderResult.getByTestId(testSubj.mac.row)).toHaveTextContent('Mac');
    expect(renderResult.getByTestId(testSubj.linux.row)).toHaveTextContent('Linux');
    expect(card.getByRole('group', { name: 'Windows' })).toBeInTheDocument();
    expect(card.getByRole('group', { name: 'Mac' })).toBeInTheDocument();
    expect(card.getByRole('group', { name: 'Linux' })).toBeInTheDocument();
  });

  it('lays each OS checkbox set out horizontally rather than stacked', () => {
    render();

    // EuiCheckbox is block-level, so the container has to be a flex row or the options stack.
    // Asserting the layout contract directly, since jsdom cannot report real geometry.
    for (const container of [
      testSubj.windows.optionsContainer,
      testSubj.mac.optionsContainer,
      testSubj.linux.optionsContainer,
    ]) {
      const element = renderResult.getByTestId(container);
      expect(element).toHaveStyleRule('display', 'flex');
      expect(element).toHaveStyleRule('flex-wrap', 'wrap');
      expect(element).not.toHaveStyleRule('flex-direction', 'column');
    }
  });

  it('renders each operating system designed checkbox set and maps Windows API to credential_access', async () => {
    render();
    const windowsRow = within(renderResult.getByTestId(testSubj.windows.row));
    const macRow = within(renderResult.getByTestId(testSubj.mac.row));
    const linuxRow = within(renderResult.getByTestId(testSubj.linux.row));

    expect(windowsRow.getAllByRole('checkbox')).toHaveLength(8);
    for (const label of [
      'DNS',
      'File',
      'Network',
      'Process',
      'Security',
      'API',
      'DLL and Driver Load',
      'Registry',
    ]) {
      expect(windowsRow.getByRole('checkbox', { name: label })).toBeInTheDocument();
    }

    expect(macRow.getAllByRole('checkbox')).toHaveLength(5);
    for (const label of ['DNS', 'File', 'Network', 'Process', 'Security']) {
      expect(macRow.getByRole('checkbox', { name: label })).toBeInTheDocument();
    }

    expect(
      within(renderResult.getByTestId(testSubj.linux.optionsContainer)).getAllByRole('checkbox')
    ).toHaveLength(4);
    // "Collect session data" is a switch, not a checkbox, so the row has five checkboxes
    // (four event types plus "Capture terminal output") and one switch.
    expect(linuxRow.getAllByRole('checkbox')).toHaveLength(5);
    for (const label of ['DNS', 'File', 'Network', 'Process', 'Capture terminal output']) {
      expect(linuxRow.getByRole('checkbox', { name: label })).toBeInTheDocument();
    }
    // EuiSwitch labels via aria-labelledby, which jsdom does not always resolve into an
    // accessible name, so assert the control identity by test subject plus role.
    const sessionDataSwitch = renderResult.getByTestId(`${testSubj.linux.row}-session_data`);
    expect(sessionDataSwitch).toHaveAttribute('role', 'switch');
    expect(linuxRow.getByText('Collect session data')).toBeInTheDocument();

    // The mock has no visible "Session data" heading. The string survives only as a
    // screen-reader-only fieldset legend, so assert the rendered heading element is gone
    // rather than the text, which is still present for assistive tech.
    expect(
      renderResult.queryByTestId(`${testSubj.linux.row}-session_dataTitle`)
    ).not.toBeInTheDocument();
    expect(
      renderResult.getByTestId(`${testSubj.linux.row}-session_dataTooltipIcon`)
    ).toBeInTheDocument();

    const credentialAccessBefore = policy.windows.events.credential_access;
    await userEvent.click(renderResult.getByTestId(testSubj.windows.credentialsCheckbox));
    expect(getUpdatedPolicy().windows.events.credential_access).toBe(!credentialAccessBefore);
  });

  it('reads each OS own values and changing macOS leaves Windows and Linux byte-identical', async () => {
    policy.windows.events = {
      credential_access: false,
      dll_and_driver_load: true,
      dns: true,
      file: false,
      network: true,
      process: false,
      registry: true,
      security: false,
    };
    policy.mac.events = {
      dns: false,
      file: true,
      network: false,
      process: true,
      security: false,
    };
    policy.linux.events = {
      dns: true,
      file: false,
      network: true,
      process: true,
      session_data: true,
      tty_io: false,
    };
    const windowsBefore = cloneDeep(policy.windows);
    const linuxBefore = cloneDeep(policy.linux);
    render();

    expect(renderResult.getByTestId(testSubj.windows.dnsCheckbox)).toBeChecked();
    expect(renderResult.getByTestId(testSubj.mac.dnsCheckbox)).not.toBeChecked();
    expect(renderResult.getByTestId(testSubj.linux.dnsCheckbox)).toBeChecked();
    expect(renderResult.getByTestId(testSubj.windows.fileCheckbox)).not.toBeChecked();
    expect(renderResult.getByTestId(testSubj.mac.fileCheckbox)).toBeChecked();
    expect(renderResult.getByTestId(testSubj.linux.fileCheckbox)).not.toBeChecked();
    expect(renderResult.getByTestId(testSubj.windows.credentialsCheckbox)).not.toBeChecked();
    expect(renderResult.getByTestId(testSubj.mac.securityCheckbox)).not.toBeChecked();
    expect(renderResult.getByTestId(testSubj.linux.sessionDataCheckbox)).toBeChecked();

    await userEvent.click(renderResult.getByTestId(testSubj.mac.dnsCheckbox));
    const updatedPolicy = getUpdatedPolicy();

    expect(updatedPolicy.mac.events.dns).toBe(true);
    expect(updatedPolicy.windows).toEqual(windowsBefore);
    expect(updatedPolicy.linux).toEqual(linuxBefore);
    expect(props.onChange).toHaveBeenCalledWith({ isValid: true, updatedPolicy });
  });

  it('hides only Linux DNS when linuxDnsEvents is disabled', () => {
    mockedContext.setExperimentalFlag({ linuxDnsEvents: false });
    render();

    expect(renderResult.getByTestId(testSubj.windows.dnsCheckbox)).toBeInTheDocument();
    expect(renderResult.getByTestId(testSubj.mac.dnsCheckbox)).toBeInTheDocument();
    expect(renderResult.queryByTestId(testSubj.linux.dnsCheckbox)).not.toBeInTheDocument();
    expect(
      within(renderResult.getByTestId(testSubj.linux.optionsContainer)).getAllByRole('checkbox')
    ).toHaveLength(3);
  });

  it('disables tty_io while session_data is false', () => {
    policy.linux.events.process = true;
    policy.linux.events.session_data = false;
    policy.linux.events.tty_io = true;
    render();

    expect(renderResult.getByTestId(testSubj.linux.captureTerminalCheckbox)).toBeDisabled();
  });

  it('turning session_data off also forces tty_io off in the emitted policy', async () => {
    policy.linux.events.process = true;
    policy.linux.events.session_data = true;
    policy.linux.events.tty_io = true;
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.linux.sessionDataCheckbox));
    const updatedPolicy = getUpdatedPolicy();

    expect(updatedPolicy.linux.events.session_data).toBe(false);
    expect(updatedPolicy.linux.events.tty_io).toBe(false);
  });

  it('renders all controls disabled and omits session instructions in view mode', () => {
    props.mode = 'view';
    render();

    expectIsViewOnly(renderResult.getByTestId(testSubj.card));
    expect(
      renderResult.queryByText(/Turn this on to capture the extended process data required/)
    ).not.toBeInTheDocument();
  });
});
