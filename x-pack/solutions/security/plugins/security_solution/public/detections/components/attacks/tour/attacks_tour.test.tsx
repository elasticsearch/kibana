/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { useKibana } from '../../../../common/lib/kibana';
import { AttacksTourProvider } from './attacks_tour_provider';
import { AttacksTour } from './attacks_tour';
import { ATTACKS_TOUR_STEP_TEST_ID, ATTACKS_TOUR_STORAGE_KEY } from './constants';

jest.mock('../../../../common/lib/kibana');

const useKibanaMock = useKibana as jest.Mock;

const createStorageMock = (initial: Record<string, unknown> = {}) => {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    get: jest.fn((key: string) => store.get(key)),
    set: jest.fn((key: string, value: unknown) => store.set(key, value)),
    remove: jest.fn((key: string) => store.delete(key)),
  };
};

const setup = ({
  toursEnabled = true,
  persisted,
}: { toursEnabled?: boolean; persisted?: Record<string, unknown> } = {}) => {
  const storage = createStorageMock(persisted ? { [ATTACKS_TOUR_STORAGE_KEY]: persisted } : {});
  useKibanaMock.mockReturnValue({
    services: {
      storage,
      telemetry: { reportEvent: jest.fn() },
      notifications: { tours: { isEnabled: jest.fn(() => toursEnabled) } },
      docLinks: { links: { siem: { attacksPage: 'http://docs.test/attacks' } } },
    },
  });
  return render(
    <AttacksTourProvider hasAttacks={false}>
      {/* anchors the tour steps point at */}
      <button type="button" data-test-subj="schedule" />
      <button type="button" data-test-subj="filter-group__context" />
      <AttacksTour />
    </AttacksTourProvider>
  );
};

describe('AttacksTour', () => {
  it('renders nothing when the tour is inactive', () => {
    setup();
    expect(screen.queryByTestId(`${ATTACKS_TOUR_STEP_TEST_ID}-next`)).not.toBeInTheDocument();
  });

  it('renders nothing when tours are disabled', () => {
    setup({
      toursEnabled: false,
      persisted: { isTourActive: true, currentTourStep: 1, isTourComplete: false },
    });
    expect(screen.queryByTestId(`${ATTACKS_TOUR_STEP_TEST_ID}-next`)).not.toBeInTheDocument();
  });
});
