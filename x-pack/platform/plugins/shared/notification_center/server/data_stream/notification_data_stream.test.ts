/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { dataStreamServiceMock } from '@kbn/core-data-streams-server-mocks';
import {
  registerNotificationDataStream,
  notificationDataStreamMappings,
  NOTIFICATION_DATA_STREAM_NAME,
  NOTIFICATION_DATA_RETENTION,
} from './notification_data_stream';

describe('registerNotificationDataStream', () => {
  it('registers exactly one data stream with core', () => {
    const dataStreams = dataStreamServiceMock.createSetupContract();
    registerNotificationDataStream(dataStreams);
    expect(dataStreams.registerDataStream).toHaveBeenCalledTimes(1);
  });

  describe('the registered definition', () => {
    const dataStreams = dataStreamServiceMock.createSetupContract();
    registerNotificationDataStream(dataStreams);
    const [definition] = dataStreams.registerDataStream.mock.calls[0];

    it('uses the canonical data stream name', () => {
      expect(definition.name).toBe(NOTIFICATION_DATA_STREAM_NAME);
      expect(NOTIFICATION_DATA_STREAM_NAME).toBe('.kibana-notification-center');
    });

    it('is hidden', () => {
      expect(definition.hidden).toBe(true);
    });

    it('has a positive version number', () => {
      expect(definition.version).toBeGreaterThan(0);
    });

    it('caps lifecycle data retention at 180 days', () => {
      expect(definition.template.lifecycle?.data_retention).toBe(NOTIFICATION_DATA_RETENTION);
      expect(NOTIFICATION_DATA_RETENTION).toBe('180d');
    });
  });

  describe('mappings', () => {
    it('disables dynamic mapping so unknown fields are stored but not indexed', () => {
      expect(notificationDataStreamMappings.dynamic).toBe(false);
    });

    it('maps only the fields queried against in ES', () => {
      const { properties } = notificationDataStreamMappings;

      expect(properties['@timestamp'].type).toBe('date');
      expect(properties.event_timestamp.type).toBe('date');
      expect(properties.notification_id.type).toBe('keyword');
      expect(properties.type.type).toBe('keyword');
      expect(properties.source_app_id.type).toBe('keyword');
      expect(properties.severity.type).toBe('keyword');
    });

    it('does not map display-only fields', () => {
      const { properties } = notificationDataStreamMappings;

      expect(properties).not.toHaveProperty('title');
      expect(properties).not.toHaveProperty('description');
      expect(properties).not.toHaveProperty('cta');
    });
  });
});
