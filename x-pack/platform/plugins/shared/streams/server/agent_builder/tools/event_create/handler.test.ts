/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createEventToolHandler } from './handler';

describe('createEventToolHandler', () => {
  it('creates a single event', async () => {
    const eventClient = {
      bulkCreate: jest.fn().mockResolvedValue({}),
    };

    const result = await createEventToolHandler({
      eventClient: eventClient as never,
      eventInput: {
        title: 'T',
        summary: 'S',
        root_cause: 'R',
        stream_names: ['logs.a'],
        criticality: 60,
        confidence: 0.7,
        recommendations: ['create incident'],
      },
    });

    expect(eventClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(eventClient.bulkCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          discovery_slug: expect.stringMatching(/^agent-event-[a-f0-9]{8}$/),
        }),
      ],
      { throwOnFail: true }
    );
    expect(result.acknowledged).toBe(true);
    expect(result.event_id).toBeTruthy();
  });
});
