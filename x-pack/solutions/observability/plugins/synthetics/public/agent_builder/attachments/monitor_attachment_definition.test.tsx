/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { httpServiceMock, notificationServiceMock } from '@kbn/core/public/mocks';
import { applicationServiceMock } from '@kbn/core-application-browser-mocks';
import { SYNTHETICS_API_URLS } from '../../../common/constants';
import {
  createMonitorAttachmentDefinition,
  MONITOR_ATTACHMENT_TYPE,
  type MonitorAttachment,
  type MonitorAttachmentDefinitionServices,
} from './monitor_attachment_definition';

const createAttachment = (overrides: { origin?: string } = {}): MonitorAttachment =>
  ({
    id: 'att-1',
    type: MONITOR_ATTACHMENT_TYPE,
    versions: [],
    current_version: 1,
    origin: overrides.origin,
    data: {
      type: 'http',
      urls: 'https://www.elastic.co',
      schedule: { number: '5', unit: 'm' },
      locations: [{ id: 'us_central', isServiceManaged: true }],
      metadata: { name: 'Elastic uptime' },
    },
  } as unknown as MonitorAttachment);

const createServices = (): MonitorAttachmentDefinitionServices => ({
  http: httpServiceMock.createStartContract(),
  application: applicationServiceMock.createStartContract(),
  notifications: notificationServiceMock.createStartContract(),
});

const getButtonsParams = (attachment: MonitorAttachment) => ({
  attachment,
  isSidebar: false,
  isCanvas: false,
  updateOrigin: jest.fn().mockResolvedValue(undefined),
});

describe('createMonitorAttachmentDefinition', () => {
  it('exposes the stable attachment type id', () => {
    expect(MONITOR_ATTACHMENT_TYPE).toBe('observability.synthetics.monitor');
  });

  describe('getLabel', () => {
    it('returns the monitor name from metadata', () => {
      const definition = createMonitorAttachmentDefinition(createServices());
      expect(definition.getLabel(createAttachment())).toBe('Elastic uptime');
    });
  });

  describe('getIcon', () => {
    it('returns globe (representing HTTP URL checks)', () => {
      const definition = createMonitorAttachmentDefinition(createServices());
      expect(definition.getIcon!()).toBe('globe');
    });
  });

  describe('renderInlineContent', () => {
    it('renders the inline content with the URL visible', () => {
      const definition = createMonitorAttachmentDefinition(createServices());
      const { getByText } = render(
        <>{definition.renderInlineContent!({ attachment: createAttachment(), isSidebar: false })}</>
      );
      expect(getByText('https://www.elastic.co')).toBeDefined();
    });
  });

  describe('getActionButtons — draft (no origin)', () => {
    it('returns a single Save monitor button', () => {
      const definition = createMonitorAttachmentDefinition(createServices());
      const buttons = definition.getActionButtons!(getButtonsParams(createAttachment()));
      expect(buttons.map((b) => b.label)).toEqual(['Save monitor']);
    });

    it('Save handler POSTs to /api/synthetics/monitors and calls updateOrigin with the returned id', async () => {
      const services = createServices();
      (services.http.post as jest.Mock).mockResolvedValue({ id: 'config-new-1' });

      const definition = createMonitorAttachmentDefinition(services);
      const params = getButtonsParams(createAttachment());
      const [saveButton] = definition.getActionButtons!(params);

      await saveButton.handler();

      expect(services.http.post).toHaveBeenCalledWith(
        SYNTHETICS_API_URLS.SYNTHETICS_MONITORS,
        expect.objectContaining({
          body: expect.stringContaining('"name":"Elastic uptime"'),
        })
      );
      expect(params.updateOrigin).toHaveBeenCalledWith('config-new-1');
      expect(services.notifications.toasts.addSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Monitor "Elastic uptime" created' })
      );
    });

    it('Save handler prefers config_id over id when both are returned', async () => {
      const services = createServices();
      (services.http.post as jest.Mock).mockResolvedValue({ id: 'so-id', config_id: 'cfg-1' });

      const definition = createMonitorAttachmentDefinition(services);
      const params = getButtonsParams(createAttachment());
      const [saveButton] = definition.getActionButtons!(params);

      await saveButton.handler();

      expect(params.updateOrigin).toHaveBeenCalledWith('cfg-1');
    });

    it('Save handler surfaces server errors via an error toast', async () => {
      const services = createServices();
      const error = new Error('Invalid location');
      (services.http.post as jest.Mock).mockRejectedValue(error);

      const definition = createMonitorAttachmentDefinition(services);
      const params = getButtonsParams(createAttachment());
      const [saveButton] = definition.getActionButtons!(params);

      await saveButton.handler();

      expect(services.notifications.toasts.addError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ title: 'Failed to save monitor "Elastic uptime"' })
      );
      expect(params.updateOrigin).not.toHaveBeenCalled();
      expect(services.notifications.toasts.addSuccess).not.toHaveBeenCalled();
    });
  });

  describe('getActionButtons — saved (origin set)', () => {
    it('returns Update monitor and View in Synthetics buttons', () => {
      const definition = createMonitorAttachmentDefinition(createServices());
      const buttons = definition.getActionButtons!(
        getButtonsParams(createAttachment({ origin: 'cfg-123' }))
      );
      expect(buttons.map((b) => b.label)).toEqual(['Update monitor', 'View in Synthetics']);
    });

    it('Update handler PUTs to the origin id and toasts on success', async () => {
      const services = createServices();
      (services.http.put as jest.Mock).mockResolvedValue({});

      const definition = createMonitorAttachmentDefinition(services);
      const [updateButton] = definition.getActionButtons!(
        getButtonsParams(createAttachment({ origin: 'cfg-123' }))
      );

      await updateButton.handler();

      expect(services.http.put).toHaveBeenCalledWith(
        `${SYNTHETICS_API_URLS.SYNTHETICS_MONITORS}/cfg-123`,
        expect.objectContaining({
          body: expect.stringContaining('"name":"Elastic uptime"'),
        })
      );
      expect(services.notifications.toasts.addSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Monitor "Elastic uptime" updated' })
      );
    });

    it('Update handler surfaces server errors via an error toast', async () => {
      const services = createServices();
      const error = new Error('Validation failed');
      (services.http.put as jest.Mock).mockRejectedValue(error);

      const definition = createMonitorAttachmentDefinition(services);
      const [updateButton] = definition.getActionButtons!(
        getButtonsParams(createAttachment({ origin: 'cfg-123' }))
      );

      await updateButton.handler();

      expect(services.notifications.toasts.addError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ title: 'Failed to update monitor "Elastic uptime"' })
      );
      expect(services.notifications.toasts.addSuccess).not.toHaveBeenCalled();
    });

    it('View handler navigates to the Synthetics monitor detail page (basePath-prepended)', () => {
      const services = createServices();
      const prependSpy = jest
        .spyOn(services.http.basePath, 'prepend')
        .mockImplementation((path) => `/base${path}`);

      const definition = createMonitorAttachmentDefinition(services);
      const buttons = definition.getActionButtons!(
        getButtonsParams(createAttachment({ origin: 'cfg-123' }))
      );
      const viewButton = buttons.find((b) => b.label === 'View in Synthetics')!;

      viewButton.handler();

      expect(prependSpy).toHaveBeenCalledWith('/app/synthetics/monitor/cfg-123');
      expect(services.application.navigateToUrl).toHaveBeenCalledWith(
        '/base/app/synthetics/monitor/cfg-123'
      );
    });
  });

  describe('flyout / canvas extension points', () => {
    it('does not register a canvas content renderer (inline-only MVP)', () => {
      const definition = createMonitorAttachmentDefinition(createServices());
      expect(definition.renderCanvasContent).toBeUndefined();
    });
  });
});
