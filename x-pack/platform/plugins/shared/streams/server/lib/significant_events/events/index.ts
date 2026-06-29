/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { EVENTS_DATA_STREAM, eventsDataStream, eventsMappings } from './data_stream';
export type { SignificantEvent, StoredEvent } from './data_stream';
export { EventClient } from './event_client';
export type { EventDataStreamClient } from './event_client';
export { EventService } from './event_service';
