/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  isCancelAction,
  isExecuteAction,
  isGetFileAction,
  isMemoryDumpAction,
  isProcessesAction,
  isRunScriptAction,
  isUploadAction,
} from './type_guards';
import type { ActionDetails } from '../../types';

const makeAction = (command: ActionDetails['command']): Pick<ActionDetails, 'command'> =>
  ({ command } as Pick<ActionDetails, 'command'>);

describe('type_guards', () => {
  describe('isCancelAction()', () => {
    it('should return true for command `cancel`', () => {
      expect(isCancelAction(makeAction('cancel'))).toBe(true);
    });

    it.each([
      'isolate',
      'unisolate',
      'kill-process',
      'suspend-process',
      'running-processes',
      'get-file',
      'execute',
      'upload',
      'scan',
      'runscript',
      'memory-dump',
    ] as const)('should return false for command `%s`', (command) => {
      expect(isCancelAction(makeAction(command))).toBe(false);
    });
  });

  describe('isUploadAction()', () => {
    it('should return true for command `upload`', () => {
      expect(isUploadAction(makeAction('upload'))).toBe(true);
    });

    it('should return false for other commands', () => {
      expect(isUploadAction(makeAction('isolate'))).toBe(false);
      expect(isUploadAction(makeAction('cancel'))).toBe(false);
    });
  });

  describe('isExecuteAction()', () => {
    it('should return true for command `execute`', () => {
      expect(isExecuteAction(makeAction('execute'))).toBe(true);
    });

    it('should return false for other commands', () => {
      expect(isExecuteAction(makeAction('isolate'))).toBe(false);
      expect(isExecuteAction(makeAction('cancel'))).toBe(false);
    });
  });

  describe('isGetFileAction()', () => {
    it('should return true for command `get-file`', () => {
      expect(isGetFileAction(makeAction('get-file'))).toBe(true);
    });

    it('should return false for other commands', () => {
      expect(isGetFileAction(makeAction('isolate'))).toBe(false);
      expect(isGetFileAction(makeAction('cancel'))).toBe(false);
    });
  });

  describe('isProcessesAction()', () => {
    it('should return true for command `running-processes`', () => {
      expect(isProcessesAction(makeAction('running-processes'))).toBe(true);
    });

    it('should return false for other commands', () => {
      expect(isProcessesAction(makeAction('isolate'))).toBe(false);
      expect(isProcessesAction(makeAction('cancel'))).toBe(false);
    });
  });

  describe('isRunScriptAction()', () => {
    it('should return true for command `runscript`', () => {
      expect(isRunScriptAction(makeAction('runscript'))).toBe(true);
    });

    it('should return false for other commands', () => {
      expect(isRunScriptAction(makeAction('isolate'))).toBe(false);
      expect(isRunScriptAction(makeAction('cancel'))).toBe(false);
    });
  });

  describe('isMemoryDumpAction()', () => {
    it('should return true for command `memory-dump`', () => {
      expect(isMemoryDumpAction(makeAction('memory-dump'))).toBe(true);
    });

    it('should return false for other commands', () => {
      expect(isMemoryDumpAction(makeAction('isolate'))).toBe(false);
      expect(isMemoryDumpAction(makeAction('cancel'))).toBe(false);
    });
  });
});
