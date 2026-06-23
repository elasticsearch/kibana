/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  LabelNodeBadges,
  TEST_SUBJ_ALERT_ICON,
  TEST_SUBJ_ALERT_COUNT,
  TEST_SUBJ_ALERT_COUNT_BUTTON,
  TEST_SUBJ_EVENT_COUNT,
  TEST_SUBJ_EVENT_COUNT_BUTTON,
} from './label_node_badges';
import { analyzeDocuments } from './analyze_documents';

describe('LabelNodeBadges', () => {
  test('renders nothing for single event', () => {
    const analysis = analyzeDocuments({ uniqueEventsCount: 1, uniqueAlertsCount: 0 });

    const { container } = render(<LabelNodeBadges analysis={analysis} />);

    expect(container.firstChild).toBe(null);
    expect(screen.queryByTestId(TEST_SUBJ_EVENT_COUNT)).not.toBeInTheDocument();
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_ICON)).not.toBeInTheDocument();
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_COUNT)).not.toBeInTheDocument();
  });

  test('renders alert badge with icon only for single alert', () => {
    const analysis = analyzeDocuments({ uniqueEventsCount: 0, uniqueAlertsCount: 1 });

    render(<LabelNodeBadges analysis={analysis} />);

    expect(screen.queryByTestId(TEST_SUBJ_EVENT_COUNT)).not.toBeInTheDocument();
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_ICON)).toBeInTheDocument();
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_COUNT)).not.toBeInTheDocument();
  });

  test('renders event badge with counter for multiple events', () => {
    const uniqueEventsCount = 3;
    const analysis = analyzeDocuments({ uniqueEventsCount, uniqueAlertsCount: 0 });

    render(<LabelNodeBadges analysis={analysis} />);

    expect(screen.getByTestId(TEST_SUBJ_EVENT_COUNT)).toHaveTextContent(
      uniqueEventsCount.toString()
    );
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_ICON)).not.toBeInTheDocument();
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_COUNT)).not.toBeInTheDocument();
  });

  test('renders alert badge with icon and counter for multiple alerts', () => {
    const uniqueAlertsCount = 3;
    const analysis = analyzeDocuments({ uniqueEventsCount: 0, uniqueAlertsCount });

    render(<LabelNodeBadges analysis={analysis} />);

    expect(screen.queryByTestId(TEST_SUBJ_EVENT_COUNT)).not.toBeInTheDocument();
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_ICON)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_SUBJ_ALERT_COUNT)).toHaveTextContent(
      uniqueAlertsCount.toString()
    );
  });

  test('renders event badge with counter and alert badge with icon and counter for one event and one alert', () => {
    const analysis = analyzeDocuments({ uniqueEventsCount: 1, uniqueAlertsCount: 1 });

    render(<LabelNodeBadges analysis={analysis} />);

    expect(screen.getByTestId(TEST_SUBJ_EVENT_COUNT)).toHaveTextContent('1');
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_ICON)).toBeInTheDocument();
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_COUNT)).toBeInTheDocument();
  });

  test('renders event badge with counter and alert badge with icon and counter for multiple events and alerts', () => {
    const uniqueEventsCount = 2;
    const uniqueAlertsCount = 2;
    const analysis = analyzeDocuments({ uniqueEventsCount, uniqueAlertsCount });

    render(<LabelNodeBadges analysis={analysis} />);

    expect(screen.getByTestId(TEST_SUBJ_EVENT_COUNT)).toHaveTextContent(
      uniqueEventsCount.toString()
    );
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_ICON)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_SUBJ_ALERT_COUNT)).toHaveTextContent(
      uniqueAlertsCount.toString()
    );
  });

  test('renders event badge with abbreviated counter and alert badge with icon and abbreviated counter for very large numbers of events and alerts', () => {
    const largeCount = 1_200_000;
    const analysis = analyzeDocuments({
      uniqueEventsCount: largeCount,
      uniqueAlertsCount: largeCount,
    });

    render(<LabelNodeBadges analysis={analysis} />);

    expect(screen.getByTestId(TEST_SUBJ_EVENT_COUNT)).toHaveTextContent('1.2m');
    expect(screen.queryByTestId(TEST_SUBJ_ALERT_ICON)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_SUBJ_ALERT_COUNT)).toHaveTextContent('1.2m');
  });

  describe('Popover', () => {
    const mockOnEventClick = jest.fn();

    beforeEach(() => {
      mockOnEventClick.mockClear();
    });

    test('calls onEventClick when event badge button is clicked', async () => {
      const analysis = analyzeDocuments({ uniqueEventsCount: 3, uniqueAlertsCount: 0 });

      render(<LabelNodeBadges analysis={analysis} onEventClick={mockOnEventClick} />);

      const eventBadgeButton = screen.getByTestId(TEST_SUBJ_EVENT_COUNT_BUTTON);
      await userEvent.click(eventBadgeButton);

      expect(mockOnEventClick).toHaveBeenCalledTimes(1);
    });

    test('does not render clickable event badge when onEventClick is not provided', () => {
      const analysis = analyzeDocuments({ uniqueEventsCount: 3, uniqueAlertsCount: 0 });

      render(<LabelNodeBadges analysis={analysis} />);

      const eventBadgeButton = screen.queryByTestId(TEST_SUBJ_EVENT_COUNT_BUTTON);
      const eventBadge = screen.queryByTestId(TEST_SUBJ_EVENT_COUNT);

      expect(eventBadgeButton).not.toBeInTheDocument();
      expect(eventBadge).toBeInTheDocument();
    });

    test('does not render event badge when single event', () => {
      const analysis = analyzeDocuments({ uniqueEventsCount: 1, uniqueAlertsCount: 0 });

      render(<LabelNodeBadges analysis={analysis} onEventClick={mockOnEventClick} />);

      const eventBadgeButton = screen.queryByTestId(TEST_SUBJ_EVENT_COUNT_BUTTON);
      expect(eventBadgeButton).not.toBeInTheDocument();
    });

    test('calls onEventClick when alert count badge button is clicked', async () => {
      const analysis = analyzeDocuments({ uniqueEventsCount: 0, uniqueAlertsCount: 3 });

      render(<LabelNodeBadges analysis={analysis} onEventClick={mockOnEventClick} />);

      const alertBadgeButton = screen.getByTestId(TEST_SUBJ_ALERT_COUNT_BUTTON);
      await userEvent.click(alertBadgeButton);

      expect(mockOnEventClick).toHaveBeenCalledTimes(1);
    });

    test('does not render clickable alert count badge when onEventClick is not provided', () => {
      const analysis = analyzeDocuments({ uniqueEventsCount: 0, uniqueAlertsCount: 3 });

      render(<LabelNodeBadges analysis={analysis} />);

      const alertBadgeButton = screen.queryByTestId(TEST_SUBJ_ALERT_COUNT_BUTTON);
      const alertBadge = screen.queryByTestId(TEST_SUBJ_ALERT_COUNT);

      expect(alertBadgeButton).not.toBeInTheDocument();
      expect(alertBadge).toBeInTheDocument();
    });

    test('calls onEventClick when alert count badge button is clicked in mixed scenario', async () => {
      const analysis = analyzeDocuments({ uniqueEventsCount: 2, uniqueAlertsCount: 2 });

      render(<LabelNodeBadges analysis={analysis} onEventClick={mockOnEventClick} />);

      const alertBadgeButton = screen.getByTestId(TEST_SUBJ_ALERT_COUNT_BUTTON);
      await userEvent.click(alertBadgeButton);

      expect(mockOnEventClick).toHaveBeenCalledTimes(1);
    });
  });
});
