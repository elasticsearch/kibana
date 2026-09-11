/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';

import { AttackDetectedOn, ATTACK_DETECTED_ON_TEST_ID } from '.';
import { useDateFormat } from '../../../common/lib/kibana';
import { getFormattedDate } from '../../pages/loading_callout/loading_messages/get_formatted_time';

jest.mock('../../../common/lib/kibana', () => ({
  useDateFormat: jest.fn(() => 'MMM D, YYYY @ HH:mm:ss.SSS'),
}));

jest.mock('../../pages/loading_callout/loading_messages/get_formatted_time', () => ({
  getFormattedDate: jest.fn(() => '2023-10-27 10:00:00'),
}));

describe('AttackDetectedOn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useDateFormat as jest.Mock).mockReturnValue('MMM D, YYYY @ HH:mm:ss.SSS');
    (getFormattedDate as jest.Mock).mockReturnValue('2023-10-27 10:00:00');
  });

  it('renders the detected on label with the formatted timestamp', () => {
    render(<AttackDetectedOn timestamp="2023-10-27T10:00:00.000Z" />);

    expect(screen.getByTestId(ATTACK_DETECTED_ON_TEST_ID)).toHaveTextContent(
      'Detected on 2023-10-27 10:00:00'
    );
  });

  it('formats the timestamp with the date format configured by the user', () => {
    render(<AttackDetectedOn timestamp="2023-10-27T10:00:00.000Z" />);

    expect(getFormattedDate).toHaveBeenCalledWith({
      date: '2023-10-27T10:00:00.000Z',
      dateFormat: 'MMM D, YYYY @ HH:mm:ss.SSS',
    });
  });

  it('renders nothing when the timestamp cannot be formatted', () => {
    (getFormattedDate as jest.Mock).mockReturnValue(null);

    render(<AttackDetectedOn timestamp="2023-10-27T10:00:00.000Z" />);

    expect(screen.queryByTestId(ATTACK_DETECTED_ON_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders nothing when the formatted timestamp is empty', () => {
    (getFormattedDate as jest.Mock).mockReturnValue('');

    render(<AttackDetectedOn timestamp="" />);

    expect(screen.queryByTestId(ATTACK_DETECTED_ON_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders nothing when the timestamp is absent', () => {
    (getFormattedDate as jest.Mock).mockReturnValue(null);

    render(<AttackDetectedOn />);

    expect(getFormattedDate).toHaveBeenCalledWith({
      date: undefined,
      dateFormat: 'MMM D, YYYY @ HH:mm:ss.SSS',
    });
    expect(screen.queryByTestId(ATTACK_DETECTED_ON_TEST_ID)).not.toBeInTheDocument();
  });
});
