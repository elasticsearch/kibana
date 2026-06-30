/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { showEuiComboBoxOptions } from '@elastic/eui/lib/test/rtl';
import { TemplateSelectorV2 } from './template_selector_v2';

const mockUseGetTemplates = jest.fn().mockReturnValue({
  data: { templates: [] },
  isLoading: false,
});

jest.mock('../../templates_v2/hooks/use_get_templates', () => ({
  useGetTemplates: (...args: unknown[]) => mockUseGetTemplates(...args),
}));

const templates = [
  { templateId: 'tmpl-1', name: 'Template One', templateVersion: 1, owner: 'securitySolution' },
  { templateId: 'tmpl-2', name: 'Template Two', templateVersion: 3, owner: 'securitySolution' },
];

describe('TemplateSelectorV2', () => {
  let user: UserEvent;
  const onChange = jest.fn();

  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime, pointerEventsCheck: 0 });
    jest.clearAllMocks();
    mockUseGetTemplates.mockReturnValue({ data: { templates }, isLoading: false });
  });

  it('renders the combobox', async () => {
    render(<TemplateSelectorV2 owner="securitySolution" templateId={null} onChange={onChange} />);
    expect(await screen.findByTestId('cases-connector-template-v2-select')).toBeInTheDocument();
  });

  it('fetches templates scoped to the owner', () => {
    render(<TemplateSelectorV2 owner="securitySolution" templateId={null} onChange={onChange} />);
    expect(mockUseGetTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        queryParams: expect.objectContaining({ owner: ['securitySolution'] }),
      })
    );
  });

  it('lists available templates', async () => {
    render(<TemplateSelectorV2 owner="securitySolution" templateId={null} onChange={onChange} />);
    await showEuiComboBoxOptions();
    expect(await screen.findByText('Template One')).toBeInTheDocument();
    expect(await screen.findByText('Template Two')).toBeInTheDocument();
  });

  it('calls onChange with templateId and templateVersion when a template is selected', async () => {
    render(<TemplateSelectorV2 owner="securitySolution" templateId={null} onChange={onChange} />);
    await showEuiComboBoxOptions();
    await user.click(await screen.findByText('Template Two'));
    expect(onChange).toHaveBeenCalledWith({ templateId: 'tmpl-2', templateVersion: '3' });
  });

  it('calls onChange with null/null when "No template selected" is chosen', async () => {
    render(<TemplateSelectorV2 owner="securitySolution" templateId="tmpl-1" onChange={onChange} />);
    await showEuiComboBoxOptions();
    await user.click(await screen.findByText('No template selected'));
    expect(onChange).toHaveBeenCalledWith({ templateId: null, templateVersion: null });
  });

  it('is disabled when isDisabled=true', async () => {
    render(
      <TemplateSelectorV2
        owner="securitySolution"
        templateId={null}
        isDisabled={true}
        onChange={onChange}
      />
    );
    expect(await screen.findByRole('combobox')).toBeDisabled();
  });

  it('shows skeleton when templates are loading', async () => {
    mockUseGetTemplates.mockReturnValue({ data: undefined, isLoading: true });
    render(<TemplateSelectorV2 owner="securitySolution" templateId={null} onChange={onChange} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
