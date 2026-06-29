/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { DETECTIONS_DATA_STREAM, detectionsDataStream, detectionsMappings } from './data_stream';
export type { Detection, StoredDetection } from './data_stream';
export { DetectionClient } from './detection_client';
export type { DetectionDataStreamClient } from './detection_client';
export { DetectionService } from './detection_service';
