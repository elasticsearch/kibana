/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { openAppMenuOverflow } from '@kbn/app-header/test_helpers';
import React from 'react';
import { ExploratoryView } from '../../exploratory_view';
import { mockAppDataView, render } from '../../rtl_helpers';
import { observabilityAIAssistantPluginMock } from '@kbn/observability-ai-assistant-plugin/public/mock';
import {
  EMBED_BUTTON_TEST_SUBJ,
  OPEN_IN_LENS_BUTTON_TEST_SUBJ,
  SAVE_BUTTON_TEST_SUBJ,
} from '../../header/use_exploratory_view_app_header_menu';

const mockObservabilityAIAssistant = observabilityAIAssistantPluginMock.createStartContract();

jest.mock('../../hooks/use_kibana', () => {
  const originalModule = jest.requireActual('../../hooks/use_kibana');
  return {
    ...originalModule,
    useKibana: () => {
      const { services } = originalModule.useKibana();
      return {
        services: {
          ...services,
          observabilityAIAssistant: mockObservabilityAIAssistant,
        },
      };
    },
  };
});

describe('Exploratory view app header actions', () => {
  mockAppDataView();

  afterAll(() => {
    jest.clearAllMocks();
  });

  async function renderReadyView(core?: { isDev?: boolean }) {
    const result = render(<ExploratoryView />, { core });
    await screen.findByText(/Lens Embeddable Component/i);
    await waitFor(() => {
      expect(screen.getByTestId(SAVE_BUTTON_TEST_SUBJ)).toBeEnabled();
    });
    return result;
  }

  it('opens Lens from the header menu', async () => {
    const { core } = await renderReadyView();

    await openAppMenuOverflow();
    fireEvent.click(await screen.findByTestId(OPEN_IN_LENS_BUTTON_TEST_SUBJ));

    expect(core.lens?.navigateToPrefilledEditor).toHaveBeenCalledTimes(1);
  });

  it('opens the save modal from the primary action', async () => {
    await renderReadyView();

    fireEvent.click(await screen.findByTestId(SAVE_BUTTON_TEST_SUBJ));

    expect(await screen.findByText('Lens Save Modal Component')).toBeInTheDocument();
  });

  it('opens the embed modal from the overflow menu in dev mode', async () => {
    await renderReadyView({ isDev: true });

    await openAppMenuOverflow();
    fireEvent.click(await screen.findByTestId(EMBED_BUTTON_TEST_SUBJ));

    expect(
      await screen.findByText('Embed Exploratory view (Dev only feature)')
    ).toBeInTheDocument();
  });

  it('hides Embed outside dev mode', async () => {
    await renderReadyView({ isDev: false });

    await openAppMenuOverflow();
    expect(screen.queryByTestId(EMBED_BUTTON_TEST_SUBJ)).not.toBeInTheDocument();
  });
});
