/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  CREATE_MONITOR_LABEL,
  SimpleMonitorForm,
  URL_REQUIRED_LABEL,
  WEBSITE_URL_HELP_TEXT,
  WEBSITE_URL_LABEL,
} from './simple_monitor_form';
import { render } from '../../utils/testing';
import React from 'react';
import { act, fireEvent, waitFor, screen } from '@testing-library/react';
import { syntheticsTestSubjects } from '../../../../../common/constants/data_test_subjects';
import { apiService } from '../../../../utils/api_service';
import * as reduxHooks from 'react-redux-v7';

jest.setTimeout(30_000);

describe('SimpleMonitorForm', () => {
  const apiSpy = jest.spyOn(apiService, 'post');
  const dispatchSpy = jest.spyOn(reduxHooks, 'useDispatch');

  it('renders', async () => {
    render(<SimpleMonitorForm />);
    expect(screen.getByText(WEBSITE_URL_LABEL)).toBeInTheDocument();
    expect(screen.getByText(WEBSITE_URL_HELP_TEXT)).toBeInTheDocument();

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalled();
    });
  });

  it('do not show validation error on touch', async () => {
    render(<SimpleMonitorForm />);
    await act(async () => {
      fireEvent.click(screen.getByTestId(syntheticsTestSubjects.urlsInput));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('comboBoxInput'));
    });

    expect(await screen.queryByText(URL_REQUIRED_LABEL)).not.toBeInTheDocument();
  });

  it('shows the validation errors on submit', async () => {
    render(<SimpleMonitorForm />);

    await act(async () => {
      fireEvent.click(screen.getByTestId(syntheticsTestSubjects.urlsInput));
    });

    await act(async () => {
      fireEvent.click(screen.getByText(CREATE_MONITOR_LABEL));
    });

    expect(screen.getByText('Please address the highlighted errors.')).toBeInTheDocument();
  });

  it('submits valid monitor', async () => {
    render(<SimpleMonitorForm />);

    await act(async () => {
      fireEvent.input(screen.getByTestId(syntheticsTestSubjects.urlsInput), {
        target: { value: 'https://www.elastic.co' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('comboBoxInput'));
    });

    expect(screen.getByText('US Central')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId(`syntheticsServiceLocation--us_central`));
    });

    await act(async () => {
      fireEvent.click(screen.getByText(CREATE_MONITOR_LABEL));
    });

    await waitFor(async () => {
      expect(apiSpy).toHaveBeenCalled();
    });
  });
});
