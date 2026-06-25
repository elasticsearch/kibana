/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { monaco } from '@kbn/code-editor';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { of } from 'rxjs';
import {
  useLookupIndexCommand,
  useCanCreateLookupIndex,
  getMonacoCommandString,
} from './use_lookup_index_editor';
import { useLookupIndexPrivileges } from './use_lookup_index_privileges';
import { coreMock } from '@kbn/core/public/mocks';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import { getLookupIndicesFromQuery } from '@kbn/esql-utils';
import {
  appendIndexToJoinCommandByName,
  appendIndexToJoinCommandByPosition,
} from './append_index_to_join_command';
import type { Trigger } from '@kbn/ui-actions-plugin/public';

// Mock dependencies
jest.mock('@kbn/esql-utils', () => ({
  getLookupIndicesFromQuery: jest.fn(),
}));

jest.mock('./use_lookup_index_privileges', () => ({
  useLookupIndexPrivileges: jest.fn(),
}));

jest.mock('./append_index_to_join_command', () => ({
  appendIndexToJoinCommandByName: jest.fn(),
  appendIndexToJoinCommandByPosition: jest.fn(),
}));

jest.mock('@kbn/react-hooks', () => ({
  useDebounceFn: jest.fn((fn) => ({ run: fn })),
}));

jest.mock('@elastic/eui', () => ({
  useEuiTheme: () => ({
    euiTheme: {
      colors: { textParagraph: '#000' },
      border: { width: { thick: '2px' } },
    },
  }),
}));

const mockServices = {
  ...coreMock.createStart(),
  uiActions: uiActionsPluginMock.createStartContract(),
};

const createWrapper = ({ children }: { children: React.ReactNode }) => (
  <KibanaContextProvider services={mockServices}>{children}</KibanaContextProvider>
);

describe('getMonacoCommandString', () => {
  it('should return create command for non-existing index with create permissions', () => {
    const result = getMonacoCommandString('test-index', false, {
      canCreateIndex: true,
      canEditIndex: true,
      canReadIndex: true,
    });
    expect(result).toBe(
      '[Create lookup index](command:esql.lookup_index.create?%7B%22indexName%22%3A%22test-index%22%2C%22doesIndexExist%22%3Afalse%2C%22canEditIndex%22%3Atrue%2C%22triggerSource%22%3A%22esql_hover%22%2C%22highestPrivilege%22%3A%22create%22%7D)'
    );
  });

  it('should return edit command for existing index with edit permissions', () => {
    const result = getMonacoCommandString('test-index', true, {
      canCreateIndex: false,
      canEditIndex: true,
      canReadIndex: true,
    });
    expect(result).toBe(
      '[Edit lookup index](command:esql.lookup_index.create?%7B%22indexName%22%3A%22test-index%22%2C%22doesIndexExist%22%3Atrue%2C%22canEditIndex%22%3Atrue%2C%22triggerSource%22%3A%22esql_hover%22%2C%22highestPrivilege%22%3A%22edit%22%7D)'
    );
  });

  it('should return view command for existing index with read permissions only', () => {
    const result = getMonacoCommandString('test-index', true, {
      canCreateIndex: false,
      canReadIndex: true,
      canEditIndex: false,
    });
    expect(result).toBe(
      '[View lookup index](command:esql.lookup_index.create?%7B%22indexName%22%3A%22test-index%22%2C%22doesIndexExist%22%3Atrue%2C%22canEditIndex%22%3Afalse%2C%22triggerSource%22%3A%22esql_hover%22%2C%22highestPrivilege%22%3A%22read%22%7D)'
    );
  });

  it('should return undefined when no permissions', () => {
    const result = getMonacoCommandString('test-index', false, {
      canCreateIndex: false,
      canReadIndex: false,
      canEditIndex: false,
    });
    expect(result).toBeUndefined();
  });

  it('should return a non-clickable warning message for a closed index', () => {
    const result = getMonacoCommandString(
      'test-index',
      true,
      {
        canCreateIndex: true,
        canEditIndex: true,
        canReadIndex: true,
      },
      true
    );
    expect(result).toContain('⚠');
    expect(result).toContain('closed');
    expect(result).not.toContain('command:');
  });

  it('should return closed warning regardless of permissions when index is closed', () => {
    const result = getMonacoCommandString(
      'test-index',
      false,
      {
        canCreateIndex: true,
        canEditIndex: false,
        canReadIndex: false,
      },
      true
    );
    expect(result).toContain('⚠');
    expect(result).toContain('closed');
    expect(result).not.toContain('Create lookup index');
  });
});

describe('useCanCreateLookupIndex', () => {
  const mockGetPermissions = jest.fn();

  beforeEach(() => {
    mockServices.application.currentAppId$ = of('discover');
    (useLookupIndexPrivileges as jest.Mock).mockReturnValue({
      getPermissions: mockGetPermissions,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return true when user has create permissions', async () => {
    mockGetPermissions.mockResolvedValue({
      'test-index': { canCreateIndex: true },
    });

    const { result } = renderHook(() => useCanCreateLookupIndex(), {
      wrapper: createWrapper,
    });

    const canCreate = await result.current('test-index');
    expect(canCreate).toBe(true);
  });

  it('should return false when user lacks create permissions', async () => {
    mockGetPermissions.mockResolvedValue({
      'test-index': { canCreateIndex: false },
    });

    const { result } = renderHook(() => useCanCreateLookupIndex(), {
      wrapper: createWrapper,
    });

    const canCreate = await result.current('test-index');
    expect(canCreate).toBe(false);
  });

  it('should return false when not in supported app', async () => {
    mockServices.application.currentAppId$ = of('dashboard');

    const { result } = renderHook(() => useCanCreateLookupIndex(), { wrapper: createWrapper });

    const canCreate = await result.current('test-index');
    expect(canCreate).toBe(false);
  });
});

describe('useLookupIndexCommand', () => {
  const mockEditorRef = { current: undefined } as React.MutableRefObject<
    monaco.editor.IStandaloneCodeEditor | undefined
  >;
  const mockEditorModel = { current: undefined } as React.MutableRefObject<
    monaco.editor.ITextModel | undefined
  >;
  const mockGetLookupIndices = jest.fn();
  const mockOnIndexCreated = jest.fn();
  const mockGetPermissions = jest.fn();
  const mockQuery = { esql: 'FROM logs | LOOKUP JOIN test-index ON field' };

  const mockEditor = {
    getPosition: jest.fn(),
    createDecorationsCollection: jest.fn(),
    getLineDecorations: jest.fn(() => []),
    removeDecorations: jest.fn(),
  } as unknown as monaco.editor.IStandaloneCodeEditor;

  const mockModel = {
    getLineCount: jest.fn(() => 5),
    findMatches: jest.fn(() => [
      { range: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 10 } },
    ]),
    deltaDecorations: jest.fn(() => ['decoration-1']),
  } as unknown as monaco.editor.ITextModel;

  beforeEach(() => {
    jest.useFakeTimers();

    mockServices.application.currentAppId$ = of('discover');

    (useLookupIndexPrivileges as jest.Mock).mockReturnValue({
      getPermissions: mockGetPermissions,
    });

    (getLookupIndicesFromQuery as jest.Mock).mockReturnValue(['test-index']);

    mockEditorRef.current = mockEditor;
    mockEditorModel.current = mockModel;

    mockGetLookupIndices.mockResolvedValue({
      indices: [{ name: 'existing-index' }],
    });

    mockGetPermissions.mockResolvedValue({
      'test-index': { canCreateIndex: true, canEditIndex: false, canReadIndex: false },
    });

    const mockTrigger = {
      exec: jest.fn(),
    } as unknown as jest.Mocked<Trigger>;
    mockServices.uiActions.getTrigger.mockReturnValue(mockTrigger);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should register monaco command on mount', () => {
    const registerCommandSpy = jest.spyOn(monaco.editor, 'registerCommand');

    renderHook(
      () =>
        useLookupIndexCommand(
          mockEditorRef,
          mockEditorModel,
          mockGetLookupIndices,
          mockQuery,
          mockOnIndexCreated
        ),
      { wrapper: createWrapper }
    );

    expect(registerCommandSpy).toHaveBeenCalledWith(
      'esql.lookup_index.create',
      expect.any(Function)
    );
  });

  it('should add decorations for lookup indices', async () => {
    const { result } = renderHook(
      () =>
        useLookupIndexCommand(
          mockEditorRef,
          mockEditorModel,
          mockGetLookupIndices,
          mockQuery,
          mockOnIndexCreated
        ),
      { wrapper: createWrapper }
    );

    result.current.addLookupIndicesDecorator();

    await jest.advanceTimersByTimeAsync(600);

    expect(mockModel.deltaDecorations).toHaveBeenCalledWith(
      [],
      expect.arrayContaining([
        expect.objectContaining({
          options: expect.objectContaining({
            hoverMessage: expect.objectContaining({
              value:
                '[Create lookup index](command:esql.lookup_index.create?%7B%22indexName%22%3A%22test-index%22%2C%22doesIndexExist%22%3Afalse%2C%22canEditIndex%22%3Afalse%2C%22triggerSource%22%3A%22esql_hover%22%2C%22highestPrivilege%22%3A%22create%22%7D)',
            }),
          }),
        }),
      ])
    );
  });

  it('should show closed warning decoration for a closed lookup index', async () => {
    mockGetLookupIndices.mockResolvedValue({
      indices: [{ name: 'test-index', isClosed: true }],
    });

    const { result } = renderHook(
      () =>
        useLookupIndexCommand(
          mockEditorRef,
          mockEditorModel,
          mockGetLookupIndices,
          mockQuery,
          mockOnIndexCreated
        ),
      { wrapper: createWrapper }
    );

    result.current.addLookupIndicesDecorator();

    await jest.advanceTimersByTimeAsync(600);

    expect(mockModel.deltaDecorations).toHaveBeenCalledWith(
      [],
      expect.arrayContaining([
        expect.objectContaining({
          options: expect.objectContaining({
            inlineClassName: expect.stringContaining('lookupIndexClosedBadge'),
            hoverMessage: expect.objectContaining({
              value: expect.stringContaining('closed'),
            }),
          }),
        }),
      ])
    );

    const call = (mockModel.deltaDecorations as jest.Mock).mock.calls[0];
    const decoration = call[1][0];
    expect(decoration.options.hoverMessage.value).not.toContain('command:');
  });

  it('should handle flyout close with index creation', async () => {
    (appendIndexToJoinCommandByName as jest.Mock).mockReturnValue(
      'FROM logs | JOIN new-index ON field'
    );

    renderHook(
      () =>
        useLookupIndexCommand(
          mockEditorRef,
          mockEditorModel,
          mockGetLookupIndices,
          mockQuery,
          mockOnIndexCreated
        ),
      { wrapper: createWrapper }
    );

    // Access the private onFlyoutClose function through the openFlyout mechanism
    (mockServices.uiActions.executeTriggerActions as jest.Mock).mockImplementation(
      async (_, context) => {
        await context.onClose({
          indexName: 'new-index',
          indexCreatedDuringFlyout: true,
        });
      }
    );

    // Trigger the command
    const registerCommandCall = jest.mocked(monaco.editor.registerCommand).mock.calls[0];
    const commandHandler = registerCommandCall[1];

    await commandHandler(undefined, {
      indexName: 'test-index',
      doesIndexExist: false,
      canEditIndex: false,
    });

    expect(mockOnIndexCreated).toHaveBeenCalledWith('FROM logs | JOIN new-index ON field');
  });

  it('should handle cursor position when no initial index name', async () => {
    (appendIndexToJoinCommandByPosition as jest.Mock).mockReturnValue(
      'FROM logs | LOOKUP JOIN cursor-index ON field'
    );

    (mockEditor.getPosition as jest.Mock).mockReturnValue({
      lineNumber: 1,
      column: 15,
    } as monaco.Position);

    renderHook(
      () =>
        useLookupIndexCommand(
          mockEditorRef,
          mockEditorModel,
          mockGetLookupIndices,
          mockQuery,
          mockOnIndexCreated
        ),
      { wrapper: createWrapper }
    );

    (mockServices.uiActions.executeTriggerActions as jest.Mock).mockImplementation(
      async (_, context) => {
        await context.onClose({
          indexName: 'cursor-index',
          indexCreatedDuringFlyout: true,
        });
      }
    );

    const registerCommandCall = jest.mocked(monaco.editor.registerCommand).mock.calls[0];
    const commandHandler = registerCommandCall[1];

    await commandHandler(undefined, {
      indexName: undefined,
      doesIndexExist: false,
      canEditIndex: false,
    });

    expect(appendIndexToJoinCommandByPosition).toHaveBeenCalledWith(
      mockQuery.esql,
      { lineNumber: 1, column: 15 },
      'cursor-index'
    );
  });

  it('should throw error when no cursor position and no index name', async () => {
    (mockEditor.getPosition as jest.Mock).mockReturnValue(null);

    renderHook(
      () =>
        useLookupIndexCommand(
          mockEditorRef,
          mockEditorModel,
          mockGetLookupIndices,
          mockQuery,
          mockOnIndexCreated
        ),
      { wrapper: createWrapper }
    );

    await expect(async () => {
      (mockServices.uiActions.executeTriggerActions as jest.Mock).mockImplementation(
        async (_, context) => {
          await context.onClose({
            indexName: 'new-index',
            indexCreatedDuringFlyout: true,
          });
        }
      );

      const registerCommandCall = jest.mocked(monaco.editor.registerCommand).mock.calls[0];
      const commandHandler = registerCommandCall[1];

      await commandHandler(undefined, {
        indexName: '',
        doesIndexExist: false,
        canEditIndex: false,
      });
    }).rejects.toThrow('Could not find a cursor position in the editor');
  });

  it('should not call onIndexCreated when index is not created', async () => {
    renderHook(
      () =>
        useLookupIndexCommand(
          mockEditorRef,
          mockEditorModel,
          mockGetLookupIndices,
          mockQuery,
          mockOnIndexCreated
        ),
      { wrapper: createWrapper }
    );

    (mockServices.uiActions.executeTriggerActions as jest.Mock).mockImplementation(
      async (_, context) => {
        await context.onClose({
          indexName: null,
          indexCreatedDuringFlyout: false,
        });
      }
    );

    const registerCommandCall = jest.mocked(monaco.editor.registerCommand).mock.calls[0];
    const commandHandler = registerCommandCall[1];

    await commandHandler(undefined, {
      indexName: 'test-index',
      doesIndexExist: false,
      canEditIndex: false,
    });

    expect(mockOnIndexCreated).not.toHaveBeenCalled();
  });

  it('should return early when not in supported app', async () => {
    mockServices.application.currentAppId$ = of('dashboard');

    const { result } = renderHook(
      () =>
        useLookupIndexCommand(
          mockEditorRef,
          mockEditorModel,
          mockGetLookupIndices,
          mockQuery,
          mockOnIndexCreated
        ),
      { wrapper: createWrapper }
    );

    const decoratorResult = await result.current.addLookupIndicesDecorator();
    expect(decoratorResult).toBe(false);
    expect(mockModel.deltaDecorations).not.toHaveBeenCalled();
  });

  it('should call onNewFieldsAddedToIndex when a new field has been added', async () => {
    const mockOnNewFieldsAddedToIndex = jest.fn();

    renderHook(
      () =>
        useLookupIndexCommand(
          mockEditorRef,
          mockEditorModel,
          mockGetLookupIndices,
          mockQuery,
          mockOnIndexCreated,
          mockOnNewFieldsAddedToIndex
        ),
      { wrapper: createWrapper }
    );

    // Access the onFlyoutClose function through the openFlyout mechanism
    (mockServices.uiActions.executeTriggerActions as jest.Mock).mockImplementation(
      async (_, context) => {
        await context.onClose({
          indexName: 'test-index',
          indexCreatedDuringFlyout: false,
          indexHasNewFields: true,
        });
      }
    );

    // Trigger the command
    const registerCommandCall = jest.mocked(monaco.editor.registerCommand).mock.calls[0];
    const commandHandler = registerCommandCall[1];

    await commandHandler(undefined, {
      indexName: 'test-index',
      doesIndexExist: false,
      canEditIndex: false,
    });

    expect(mockOnNewFieldsAddedToIndex).toHaveBeenCalledWith('test-index');
  });

  it('should not call onNewFieldsAddedToIndex when no new field has been added', async () => {
    const mockOnNewFieldsAddedToIndex = jest.fn();

    renderHook(
      () =>
        useLookupIndexCommand(
          mockEditorRef,
          mockEditorModel,
          mockGetLookupIndices,
          mockQuery,
          mockOnIndexCreated,
          mockOnNewFieldsAddedToIndex
        ),
      { wrapper: createWrapper }
    );

    // Access the onFlyoutClose function through the openFlyout mechanism
    (mockServices.uiActions.executeTriggerActions as jest.Mock).mockImplementation(
      async (_, context) => {
        await context.onClose({
          indexName: 'test-index',
          indexCreatedDuringFlyout: false,
          indexHasNewFields: false,
        });
      }
    );

    // Trigger the command
    const registerCommandCall = jest.mocked(monaco.editor.registerCommand).mock.calls[0];
    const commandHandler = registerCommandCall[1];

    await commandHandler(undefined, {
      indexName: 'test-index',
      doesIndexExist: false,
      canEditIndex: false,
    });

    expect(mockOnNewFieldsAddedToIndex).not.toHaveBeenCalled();
  });
});
