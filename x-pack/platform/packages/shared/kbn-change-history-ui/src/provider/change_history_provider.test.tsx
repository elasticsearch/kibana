/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import { I18nProvider } from '@kbn/i18n-react';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ChangeHistoryModal } from '../components/modal/change_history_modal';
import { ChangeHistoryTrigger } from '../components/modal/change_history_trigger';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import { ChangeHistoryProvider } from './change_history_provider';
import { useChangeHistoryConfig } from './use_change_history_config';
import { useChangeHistoryModal } from './use_change_history_modal';
import {
  TEST_OBJECT_ID_A,
  TEST_OBJECT_ID_B,
  TEST_OBJECT_TITLE,
} from '../test_utils/change_history_test_fixtures';
import { createQueryClientWrapper } from '../test_utils/create_query_client_wrapper';
import { ChangeHistoryTelemetryEventTypes } from '../telemetry/types';

const { wrapper: QueryClientWrapper } = createQueryClientWrapper();

const testScope = {
  module: 'stack',
  dataset: 'workflows',
  objectType: 'workflow',
};

const adapter: ChangeHistoryAdapter = {
  listChanges: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  getChange: jest.fn(),
};

const Harness = ({
  objectId,
  reportEvent = undefined,
  telemetryEnabled = true,
}: {
  objectId: string;
  reportEvent?: jest.Mock;
  telemetryEnabled?: boolean;
}) => (
  <I18nProvider>
    <QueryClientWrapper>
      <ChangeHistoryProvider
        objectId={objectId}
        adapter={adapter}
        labels={{ previewTitle: TEST_OBJECT_TITLE }}
        renderPreview={() => <div data-test-subj="previewPanel" />}
        scope={testScope}
        analytics={reportEvent ? { reportEvent } : undefined}
        features={{ telemetry: telemetryEnabled }}
      >
        <ChangeHistoryTrigger />
        <ChangeHistoryModal />
      </ChangeHistoryProvider>
    </QueryClientWrapper>
  </I18nProvider>
);

describe('ChangeHistoryProvider', () => {
  it('reports change_history_opened when the modal is opened', () => {
    const reportEvent = jest.fn();
    render(<Harness objectId={TEST_OBJECT_ID_A} reportEvent={reportEvent} />);

    fireEvent.click(screen.getByTestId('changeHistoryTrigger'));

    expect(reportEvent).toHaveBeenCalledTimes(1);
    expect(reportEvent).toHaveBeenCalledWith(ChangeHistoryTelemetryEventTypes.Opened, {
      eventName: 'Change history opened',
      ...testScope,
    });
  });

  it('does not report change_history_opened when telemetry is disabled', () => {
    const reportEvent = jest.fn();
    render(
      <Harness objectId={TEST_OBJECT_ID_A} reportEvent={reportEvent} telemetryEnabled={false} />
    );

    fireEvent.click(screen.getByTestId('changeHistoryTrigger'));

    expect(reportEvent).not.toHaveBeenCalled();
  });

  it('reports change_history_opened only once per open transition', () => {
    const reportEvent = jest.fn();

    const Probe = () => {
      const { openModal } = useChangeHistoryModal();
      return (
        <button
          type="button"
          data-test-subj="openTwice"
          onClick={() => {
            openModal();
            openModal();
          }}
        />
      );
    };

    render(
      <I18nProvider>
        <QueryClientWrapper>
          <ChangeHistoryProvider
            objectId={TEST_OBJECT_ID_A}
            adapter={adapter}
            labels={{ previewTitle: TEST_OBJECT_TITLE }}
            renderPreview={() => null}
            scope={testScope}
            analytics={{ reportEvent }}
          >
            <Probe />
          </ChangeHistoryProvider>
        </QueryClientWrapper>
      </I18nProvider>
    );

    fireEvent.click(screen.getByTestId('openTwice'));

    expect(reportEvent).toHaveBeenCalledTimes(1);
  });

  it('reports change_history_opened on each close then reopen transition', () => {
    const reportEvent = jest.fn();

    const Probe = () => {
      const { openModal, closeModal } = useChangeHistoryModal();
      return (
        <>
          <button type="button" data-test-subj="openModal" onClick={openModal} />
          <button type="button" data-test-subj="closeModal" onClick={closeModal} />
        </>
      );
    };

    render(
      <I18nProvider>
        <QueryClientWrapper>
          <ChangeHistoryProvider
            objectId={TEST_OBJECT_ID_A}
            adapter={adapter}
            labels={{ previewTitle: TEST_OBJECT_TITLE }}
            renderPreview={() => null}
            scope={testScope}
            analytics={{ reportEvent }}
          >
            <Probe />
          </ChangeHistoryProvider>
        </QueryClientWrapper>
      </I18nProvider>
    );

    fireEvent.click(screen.getByTestId('openModal'));
    expect(reportEvent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('closeModal'));
    expect(reportEvent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('openModal'));
    expect(reportEvent).toHaveBeenCalledTimes(2);
    expect(reportEvent).toHaveBeenNthCalledWith(2, ChangeHistoryTelemetryEventTypes.Opened, {
      eventName: 'Change history opened',
      ...testScope,
    });
  });

  it('closes the modal when objectId changes', () => {
    const { rerender } = render(<Harness objectId={TEST_OBJECT_ID_A} />);

    fireEvent.click(screen.getByTestId('changeHistoryTrigger'));
    expect(screen.getByTestId('changeHistoryModal')).toBeInTheDocument();

    rerender(<Harness objectId={TEST_OBJECT_ID_B} />);
    expect(screen.queryByTestId('changeHistoryModal')).not.toBeInTheDocument();
  });

  it('exposes a no-op telemetry reporter when analytics is omitted', () => {
    const reportEvent = jest.fn();
    const Probe = () => {
      const { telemetry } = useChangeHistoryConfig();
      telemetry.reportOpened();
      return null;
    };

    render(
      <I18nProvider>
        <QueryClientWrapper>
          <ChangeHistoryProvider
            objectId={TEST_OBJECT_ID_A}
            adapter={adapter}
            labels={{ previewTitle: TEST_OBJECT_TITLE }}
            renderPreview={() => null}
            scope={testScope}
          >
            <Probe />
          </ChangeHistoryProvider>
        </QueryClientWrapper>
      </I18nProvider>
    );

    expect(reportEvent).not.toHaveBeenCalled();
  });

  it('exposes a telemetry reporter that respects features.telemetry', () => {
    const reportEvent = jest.fn();

    const Probe = () => {
      const { telemetry } = useChangeHistoryConfig();
      telemetry.reportOpened();
      return null;
    };

    render(
      <I18nProvider>
        <QueryClientWrapper>
          <ChangeHistoryProvider
            objectId={TEST_OBJECT_ID_A}
            adapter={adapter}
            labels={{ previewTitle: TEST_OBJECT_TITLE }}
            renderPreview={() => null}
            scope={testScope}
            analytics={{ reportEvent }}
            features={{ telemetry: false }}
          >
            <Probe />
          </ChangeHistoryProvider>
        </QueryClientWrapper>
      </I18nProvider>
    );

    expect(reportEvent).not.toHaveBeenCalled();
  });

  it('wires scope and analytics into the config telemetry reporter', () => {
    const reportEvent = jest.fn();

    const Probe = () => {
      const { telemetry } = useChangeHistoryConfig();
      telemetry.reportFilterApplied({ filterType: 'actor', activeActorCount: 2 });
      return null;
    };

    render(
      <I18nProvider>
        <QueryClientWrapper>
          <ChangeHistoryProvider
            objectId={TEST_OBJECT_ID_A}
            adapter={adapter}
            labels={{ previewTitle: TEST_OBJECT_TITLE }}
            renderPreview={() => null}
            scope={testScope}
            analytics={{ reportEvent }}
          >
            <Probe />
          </ChangeHistoryProvider>
        </QueryClientWrapper>
      </I18nProvider>
    );

    expect(reportEvent).toHaveBeenCalledWith(ChangeHistoryTelemetryEventTypes.FilterApplied, {
      eventName: 'Change history filter applied',
      ...testScope,
      filterType: 'actor',
      activeActorCount: 2,
    });
  });
});
