/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const OPEN_FILE_UPLOAD_LITE_ACTION = 'openFileUploadLiteTrigger';

export const OPEN_FILE_UPLOAD_LITE_TRIGGER = 'OPEN_FILE_UPLOAD_LITE_TRIGGER';

export const FILE_FORMATS = {
  DELIMITED: 'delimited',
  NDJSON: 'ndjson',
  SEMI_STRUCTURED_TEXT: 'semi_structured_text',
  TIKA: 'tika',
};

export const UI_SETTING_MAX_FILE_SIZE = 'fileUpload:maxFileSize';
export const MAX_FILE_SIZE = '100MB';
export const MAX_FILE_SIZE_BYTES = 524288000; // 500MB
export const ABSOLUTE_MAX_FILE_SIZE_BYTES = 1073741274; // 1GB
export const FILE_SIZE_DISPLAY_FORMAT = '0,0.[0] b';
export const MAX_TIKA_FILE_SIZE_BYTES = 62914560; // 60MB
export const INITIALIZE_IMPORT_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_FILE_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

export const NO_TIME_FORMAT = 'null';
export const MB = Math.pow(2, 20);

export const TIKA_PREVIEW_CHARS = 100000;
export const INDEX_META_DATA_CREATED_BY = 'file-data-visualizer';
