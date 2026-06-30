/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useKibana } from '../../../../common/lib/kibana';
import { AttacksEventTypes } from '../../../../common/lib/telemetry';
import { AttacksTourProvider } from './attacks_tour_provider';
import { WelcomeTourCallout } from './welcome_tour_callout';
import {
  ATTACKS_TOUR_CALLOUT_DISMISS_TEST_ID,
  ATTACKS_TOUR_CALLOUT_DOCS_TEST_ID,
  ATTACKS_TOUR_CALLOUT_START_TEST_ID,
  ATTACKS_TOUR_CALLOUT_TEST_ID,
  ATTACKS_TOUR_STORAGE_KEY,
} from './constants';

jest.mock('../../../../common/lib/kibana');

const useKibanaMock = useKibana as jest.Mock;
const DOCS_URL = 'http://docs.test/attacks';

const createStorageMock = (initial: Record<string, unknown> = {}) => {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    get: jest.fn((key: string) => store.get(key)),
    set: jest.fn((key: string, value: unknown) => store.set(key, value)),
    remove: jest.fn((key: string) => store.delete(key)),
  };
};

let reportEvent: jest.Mock;

const renderCallout = ({
  toursEnabled = true,
  persisted,
}: { toursEnabled?: boolean; persisted?: Record<string, unknown> } = {}) => {
  reportEvent = jest.fn();
  const storage = createStorageMock(persisted ? { [ATTACKS_TOUR_STORAGE_KEY]: persisted } : {});
  useKibanaMock.mockReturnValue({
    services: {
      storage,
      telemetry: { reportEvent },
      notifications: { tours: { isEnabled: jest.fn(() => toursEnabled) } },
      docLinks: { links: { siem: { attacksPage: DOCS_URL } } },
    },
  });
  return render(
    <AttacksTourProvider hasAttacks={false}>
      <WelcomeTourCallout />
    </AttacksTourProvider>
  );
};

describe('WelcomeTourCallout', () => {
  it('renders when not dismissed, tour inactive, and tours enabled', () => {
    renderCallout();
    expect(screen.getByTestId(ATTACKS_TOUR_CALLOUT_TEST_ID)).toBeInTheDocument();
  });

  it('does not render when tours are disabled', () => {
    renderCallout({ toursEnabled: false });
    expect(screen.queryByTestId(ATTACKS_TOUR_CALLOUT_TEST_ID)).not.toBeInTheDocument();
  });

  it('links the docs button to the attacks page docs url', () => {
    renderCallout();
    expect(screen.getByTestId(ATTACKS_TOUR_CALLOUT_DOCS_TEST_ID)).toHaveAttribute('href', DOCS_URL);
  });

  it('reports view_docs telemetry when the docs link is clicked', () => {
    renderCallout();
    fireEvent.click(screen.getByTestId(ATTACKS_TOUR_CALLOUT_DOCS_TEST_ID));
    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.TourCalloutAction, {
      action: 'view_docs',
    });
  });

  it('hides after dismiss', () => {
    renderCallout();
    fireEvent.click(screen.getByTestId(ATTACKS_TOUR_CALLOUT_DISMISS_TEST_ID));
    expect(screen.queryByTestId(ATTACKS_TOUR_CALLOUT_TEST_ID)).not.toBeInTheDocument();
  });

  it('reports dismiss telemetry on dismiss', () => {
    renderCallout();
    fireEvent.click(screen.getByTestId(ATTACKS_TOUR_CALLOUT_DISMISS_TEST_ID));
    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.TourCalloutAction, {
      action: 'dismiss',
    });
  });

  it('hides the callout when the tour is started', () => {
    renderCallout();
    fireEvent.click(screen.getByTestId(ATTACKS_TOUR_CALLOUT_START_TEST_ID));
    expect(screen.queryByTestId(ATTACKS_TOUR_CALLOUT_TEST_ID)).not.toBeInTheDocument();
  });
});
