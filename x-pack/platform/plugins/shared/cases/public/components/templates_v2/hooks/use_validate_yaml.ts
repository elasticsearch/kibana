/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import { parseAllDocuments } from 'yaml';
import * as i18n from '../translations';

const ACCEPTED_MIME_TYPES = new Set([
  'application/x-yaml',
  'text/yaml',
  'text/x-yaml',
  'application/yaml',
]);
const ACCEPTED_EXTENSIONS = new Set(['.yaml', '.yml']);
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB
const MAX_FILE_SIZE_LABEL = '1 MB';
const MAX_FILES = 100;
const FILE_NAME_PATTERN = /^[\w\-. ]+$/;

export interface FileValidationError {
  fileName: string;
  message: string;
}

export interface ValidatedFile {
  file: File;
  documents: unknown[];
}

export interface FileValidationResult {
  validFiles: ValidatedFile[];
  errors: FileValidationError[];
}

const getFileExtension = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : '';
};

const hasValidExtension = (fileName: string): boolean =>
  ACCEPTED_EXTENSIONS.has(getFileExtension(fileName));

const hasValidMimeType = (file: File): boolean =>
  file.type === '' || ACCEPTED_MIME_TYPES.has(file.type);

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const getMetadataError = (file: File): string | null => {
  if (!FILE_NAME_PATTERN.test(file.name)) {
    return i18n.INVALID_FILE_NAME(file.name);
  }
  if (!hasValidExtension(file.name) || !hasValidMimeType(file)) {
    return i18n.INVALID_FILE_TYPE(file.name);
  }
  if (file.size === 0) {
    return i18n.EMPTY_FILE(file.name);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return i18n.FILE_TOO_LARGE(file.name, MAX_FILE_SIZE_LABEL);
  }
  return null;
};

export const useValidateYaml = () => {
  const validateFiles = useCallback(async (files: File[]): Promise<FileValidationResult> => {
    const errors: FileValidationError[] = [];
    const validFiles: ValidatedFile[] = [];

    if (files.length > MAX_FILES) {
      errors.push({
        fileName: '',
        message: i18n.TOO_MANY_FILES(MAX_FILES),
      });
      return { validFiles, errors };
    }

    const metadataValid: File[] = [];
    for (const file of files) {
      const error = getMetadataError(file);
      if (error) {
        errors.push({ fileName: file.name, message: error });
      } else {
        metadataValid.push(file);
      }
    }

    const parseResults = await Promise.allSettled(
      metadataValid.map(async (file) => {
        const text = await readFileAsText(file);
        const documents = parseAllDocuments(text).map((doc) => {
          if (doc.errors.length > 0) throw doc.errors[0];
          return doc.toJS();
        });
        return { file, documents };
      })
    );

    for (let idx = 0; idx < parseResults.length; idx++) {
      const result = parseResults[idx];
      if (result.status === 'fulfilled') {
        validFiles.push(result.value);
      } else {
        const fileName = metadataValid[idx].name;
        const reason =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors.push({
          fileName,
          message: i18n.INVALID_YAML_SYNTAX(fileName, reason),
        });
      }
    }

    return { validFiles, errors };
  }, []);

  return { validateFiles };
};
