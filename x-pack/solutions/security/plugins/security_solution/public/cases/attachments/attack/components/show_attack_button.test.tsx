/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShowAttackButton } from './show_attack_button';
import { useFlyoutApi } from '../../../../flyout_v2/use_flyout_api';
import { createFlyoutApiMock } from '../../../../flyout_v2/use_flyout_api.mock';
import { useIsNewFlyoutEnabled } from '../../../../common/hooks/use_is_new_flyout_enabled';
import { FLYOUT_ORIGIN } from '../../../../common/lib/telemetry';
import { AttackDetailsRightPanelKey } from '../../../../flyout/attack_details/constants/panel_keys';

// The attachment snapshots the attack document's `_index`, i.e. the concrete backing index.
const props = {
  id: 'action-id',
  attackId: 'attack-id-1',
  indexName: '.internal.alerts-security.attack.discovery.alerts-default-000001',
  attackTitle: 'Credential harvesting on host-1',
};

// What the flyout is opened with: the readable alias pattern, not the backing index.
const EXPECTED_INDEX_NAME = '.alerts-security.attack.discovery.alerts-*';

const TEST_SUBJ = 'comment-action-show-attack-action-id';

const mockOpenFlyout = jest.fn();

jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: () => ({ openFlyout: mockOpenFlyout }),
}));

jest.mock('../../../../flyout_v2/use_flyout_api');
jest.mock('../../../../common/hooks/use_is_new_flyout_enabled');

describe('ShowAttackButton', () => {
  let flyoutApi: ReturnType<typeof createFlyoutApiMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    flyoutApi = createFlyoutApiMock();
    jest.mocked(useFlyoutApi).mockReturnValue(flyoutApi);
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(false);
  });

  it('renders the show attack button with a tooltip and an aria label', async () => {
    render(<ShowAttackButton {...props} />);

    const button = screen.getByTestId(TEST_SUBJ);
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Show attack details');

    fireEvent.mouseOver(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Show attack details');
  });

  it('opens the new attack flyout when the new flyout is enabled', () => {
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);

    render(<ShowAttackButton {...props} />);
    fireEvent.click(screen.getByTestId(TEST_SUBJ));

    expect(flyoutApi.openAttackFlyout).toHaveBeenCalledWith({
      attackId: 'attack-id-1',
      indexName: EXPECTED_INDEX_NAME,
      attackTitle: 'Credential harvesting on host-1',
      origin: FLYOUT_ORIGIN.CASE_ATTACHMENT,
    });
    expect(mockOpenFlyout).not.toHaveBeenCalled();
  });

  it('opens the legacy expandable flyout when the new flyout is disabled', () => {
    render(<ShowAttackButton {...props} />);
    fireEvent.click(screen.getByTestId(TEST_SUBJ));

    expect(mockOpenFlyout).toHaveBeenCalledWith({
      right: {
        id: AttackDetailsRightPanelKey,
        params: {
          attackId: 'attack-id-1',
          indexName: EXPECTED_INDEX_NAME,
        },
      },
    });
    expect(flyoutApi.openAttackFlyout).not.toHaveBeenCalled();
  });

  it('opens an adhoc attack with the adhoc index pattern', () => {
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);

    render(
      <ShowAttackButton
        {...props}
        indexName=".internal.adhoc.alerts-security.attack.discovery.alerts-default-000001"
      />
    );
    fireEvent.click(screen.getByTestId(TEST_SUBJ));

    expect(flyoutApi.openAttackFlyout).toHaveBeenCalledWith(
      expect.objectContaining({
        indexName: '.adhoc.alerts-security.attack.discovery.alerts-*',
      })
    );
  });
});
