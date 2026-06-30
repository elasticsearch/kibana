/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import type { Streams } from '@kbn/streams-schema';
import type { CoreStart } from '@kbn/core/public';
import type { SharePublicStart } from '@kbn/share-plugin/public/plugin';
import { copyToClipboard } from '@elastic/eui';
import {
  LifecycleTabLabel,
  LifecycleTabLabelWithActions,
} from './lifecycle_tab_label_with_actions';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    copyToClipboard: jest.fn(() => true),
  };
});

const mockCopyToClipboard = copyToClipboard as jest.Mock;

const openActionsMenu = async () => {
  await userEvent.click(screen.getByTestId('streamsLifecycleTabActionsButton'));
};

// The EUI popover panel sets `pointer-events: none` during its open animation in jsdom,
// so menu items must be clicked without the pointer-events check.
const clickMenuItem = async (testSubj: string) => {
  await userEvent.click(screen.getByTestId(testSubj), {
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });
};

describe('LifecycleTabLabelWithActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('always renders the tab label', () => {
    render(<LifecycleTabLabelWithActions showActions={false} onCopy={jest.fn()} />);

    expect(screen.getByTestId('retentionTab')).toHaveTextContent('Data lifecycle');
  });

  it('does not render the actions button when showActions is false', () => {
    render(<LifecycleTabLabelWithActions showActions={false} onCopy={jest.fn()} />);

    expect(screen.queryByTestId('streamsLifecycleTabActionsButton')).not.toBeInTheDocument();
  });

  it('renders the actions button when showActions is true', () => {
    render(<LifecycleTabLabelWithActions showActions onCopy={jest.fn()} />);

    expect(screen.getByTestId('streamsLifecycleTabActionsButton')).toBeInTheDocument();
  });

  it('calls onCopy when the copy menu item is clicked', async () => {
    const onCopy = jest.fn();
    render(<LifecycleTabLabelWithActions showActions onCopy={onCopy} />);

    await openActionsMenu();
    await clickMenuItem('streamsLifecycleTabCopyApiRequest');

    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('does not render the edit index template item when onEditIndexTemplate is not provided', async () => {
    render(<LifecycleTabLabelWithActions showActions onCopy={jest.fn()} />);

    await openActionsMenu();

    expect(screen.queryByTestId('streamsLifecycleTabEditIndexTemplate')).not.toBeInTheDocument();
  });

  it('disables the edit index template item when no index template name is available', async () => {
    render(
      <LifecycleTabLabelWithActions
        showActions
        onCopy={jest.fn()}
        onEditIndexTemplate={jest.fn()}
      />
    );

    await openActionsMenu();

    expect(screen.getByTestId('streamsLifecycleTabEditIndexTemplate')).toBeDisabled();
  });

  it('calls onEditIndexTemplate with the template name when enabled', async () => {
    const onEditIndexTemplate = jest.fn();
    render(
      <LifecycleTabLabelWithActions
        showActions
        onCopy={jest.fn()}
        indexTemplateName="logs@stream"
        onEditIndexTemplate={onEditIndexTemplate}
      />
    );

    await openActionsMenu();
    await clickMenuItem('streamsLifecycleTabEditIndexTemplate');

    expect(onEditIndexTemplate).toHaveBeenCalledWith('logs@stream');
  });
});

describe('LifecycleTabLabel', () => {
  const createDefinition = (): Streams.WiredStream.GetResponse => ({
    stream: {
      type: 'wired',
      name: 'logs-test',
      description: '',
      updated_at: '2026-01-01T00:00:00.000Z',
      ingest: {
        lifecycle: { dsl: { data_retention: '30d' } },
        processing: { steps: [], updated_at: '2026-01-01T00:00:00.000Z' },
        settings: {},
        wired: { fields: {}, routing: [] },
        failure_store: { inherit: {} },
      },
    },
    effective_lifecycle: { dsl: { data_retention: '30d' }, from: 'logs-test' },
    effective_settings: {},
    data_stream_exists: true,
    inherited_fields: {},
    dashboards: [],
    rules: [],
    privileges: {
      manage: true,
      monitor: true,
      lifecycle: true,
      simulate: true,
      text_structure: true,
      read_failure_store: true,
      manage_failure_store: true,
      view_index_metadata: true,
      create_snapshot_repository: true,
    },
    effective_failure_store: {
      lifecycle: { enabled: { is_default_retention: true } },
      from: 'logs-test',
    },
  });

  const createNotifications = () =>
    ({
      toasts: { addSuccess: jest.fn() },
    } as unknown as CoreStart['notifications']);

  const createShare = (
    locatorGetUrl = jest.fn(async () => '/app/management/data/index_management')
  ) =>
    ({
      url: {
        locators: {
          get: jest.fn(() => ({ getUrl: locatorGetUrl })),
        },
      },
    } as unknown as SharePublicStart);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies the lifecycle API request and shows a success toast', async () => {
    const notifications = createNotifications();

    render(
      <LifecycleTabLabel
        definition={createDefinition()}
        showActions
        notifications={notifications}
        share={createShare()}
      />
    );

    await openActionsMenu();
    await clickMenuItem('streamsLifecycleTabCopyApiRequest');

    expect(mockCopyToClipboard).toHaveBeenCalledTimes(1);
    const copied = mockCopyToClipboard.mock.calls[0][0];
    expect(copied).toContain('PUT /api/streams/logs-test/_ingest');
    expect(notifications.toasts.addSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not show a success toast when copying to clipboard fails', async () => {
    mockCopyToClipboard.mockReturnValueOnce(false);
    const notifications = createNotifications();

    render(
      <LifecycleTabLabel
        definition={createDefinition()}
        showActions
        notifications={notifications}
        share={createShare()}
      />
    );

    await openActionsMenu();
    await clickMenuItem('streamsLifecycleTabCopyApiRequest');

    expect(notifications.toasts.addSuccess).not.toHaveBeenCalled();
  });

  it('opens the index template edit page in a new tab via the index management locator', async () => {
    const editUrl = '/app/management/data/index_management/templates/edit/logs@stream';
    const locatorGetUrl = jest.fn(async () => editUrl);
    const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <LifecycleTabLabel
        definition={createDefinition()}
        showActions
        indexTemplateName="logs@stream"
        notifications={createNotifications()}
        share={createShare(locatorGetUrl)}
      />
    );

    await openActionsMenu();
    await clickMenuItem('streamsLifecycleTabEditIndexTemplate');

    expect(locatorGetUrl).toHaveBeenCalledWith({
      page: 'index_template_edit',
      indexTemplate: 'logs@stream',
    });
    expect(windowOpenSpy).toHaveBeenCalledWith(editUrl, '_blank');

    windowOpenSpy.mockRestore();
  });
});
