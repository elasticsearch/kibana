/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Attachment type identifier for visualizations.
 *
 * The literal value is intentionally kept as `'visualization'` for backwards
 * compatibility: attachments persisted before this type was extracted into its
 * own module store this exact string and must keep resolving.
 */
export const VISUALIZATION_ATTACHMENT_TYPE = 'visualization';
