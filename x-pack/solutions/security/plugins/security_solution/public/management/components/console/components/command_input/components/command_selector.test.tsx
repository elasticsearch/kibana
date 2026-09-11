/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { waitFor, act, fireEvent } from '@testing-library/react';
import type { ConsoleTestSetup } from '../../../mocks';
import { getConsoleTestSetup, triggerConsoleCommandInputEvent } from '../../../mocks';
import type { CommandDefinition } from '../../..';

jest.setTimeout(60_000);

describe('Console: CommandSelector', () => {
  let testSetup: ConsoleTestSetup;
  let renderResult: ReturnType<ConsoleTestSetup['renderConsole']>;
  let enterCommand: ConsoleTestSetup['enterCommand'];

  const openSelectorPopover = async () => {
    await triggerConsoleCommandInputEvent(renderResult, {
      key: ' ',
      code: 'Space',
      altKey: true,
    });
  };

  describe('when no command has been entered', () => {
    beforeEach(() => {
      testSetup = getConsoleTestSetup();
      ({ enterCommand } = testSetup);
      renderResult = testSetup.renderConsole();
    });

    it('should show "Available commands" as the title', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getByText('Available commands')).not.toBeNull();
      });
    });

    it('should list all available commands as selectable options', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getAllByRole('option').length).toBeGreaterThan(0);
      });
    });

    it('should display the command description alongside the command name', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getByText('a command with no options')).not.toBeNull();
      });
    });

    it('should list commands sorted alphabetically', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getAllByRole('option').length).toBeGreaterThan(1);
      });

      const options = renderResult.getAllByRole('option');
      // Extract the command name (text before the first space) from each option label
      const commandNames = options.map((opt) => (opt.textContent ?? '').trim().split(' ')[0]);

      for (let i = 1; i < commandNames.length; i++) {
        expect(commandNames[i - 1].localeCompare(commandNames[i])).toBeLessThanOrEqual(0);
      }
    });

    it('should update the console input with the selected command and close the popover', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getAllByRole('option').length).toBeGreaterThan(0);
      });

      const cmd1Option = renderResult
        .getAllByRole('option')
        .find((opt) => opt.textContent?.trim().startsWith('cmd1'));
      expect(cmd1Option).toBeDefined();

      act(() => {
        fireEvent.click(cmd1Option!);
      });

      await waitFor(() => {
        expect(renderResult.getByTestId('test-cmdInput-leftOfCursor').textContent).toEqual('cmd1');
      });

      expect(renderResult.queryByText('Available commands')).toBeNull();
    });

    it('should return focus to the console input after selecting a command', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getAllByRole('option').length).toBeGreaterThan(0);
      });

      act(() => {
        fireEvent.click(renderResult.getAllByRole('option')[0]);
      });

      await waitFor(() => {
        expect(
          renderResult.getByTestId('test-keyCapture-input').querySelector('input')
        ).toHaveFocus();
      });
    });

    it('should include commands with required args in the options list', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        const options = renderResult.getAllByRole('option');
        expect(options.some((opt) => opt.textContent?.includes('cmd2'))).toBe(true);
      });
    });
  });

  describe('when a command has been entered', () => {
    beforeEach(async () => {
      testSetup = getConsoleTestSetup();
      ({ enterCommand } = testSetup);
      renderResult = testSetup.renderConsole();
      await enterCommand('cmd2', { inputOnly: true });
    });

    it('should show "{commandName} command arguments" as the title', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getByText('cmd2 command arguments')).not.toBeNull();
      });
    });

    it('should list the command arguments as selectable options', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        const options = renderResult.getAllByRole('option');
        expect(options.some((opt) => opt.textContent?.includes('--file'))).toBe(true);
        expect(options.some((opt) => opt.textContent?.includes('--ext'))).toBe(true);
        expect(options.some((opt) => opt.textContent?.includes('--bad'))).toBe(true);
      });
    });

    it('should list arguments sorted alphabetically', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getAllByRole('option').length).toBeGreaterThan(1);
      });

      const options = renderResult.getAllByRole('option');
      // Argument labels are in the form '--argName'; extract just the arg name for comparison
      const argNames = options.map((opt) => (opt.textContent ?? '').trim());

      for (let i = 1; i < argNames.length; i++) {
        expect(argNames[i - 1].localeCompare(argNames[i])).toBeLessThanOrEqual(0);
      }
    });

    it('should append the selected argument to the command in the console input', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getAllByRole('option').length).toBeGreaterThan(0);
      });

      const fileOption = renderResult
        .getAllByRole('option')
        .find((opt) => opt.textContent?.includes('--file'));
      expect(fileOption).toBeDefined();

      act(() => {
        fireEvent.click(fileOption!);
      });

      await waitFor(() => {
        expect(renderResult.getByTestId('test-cmdInput-leftOfCursor').textContent).toEqual(
          'cmd2 --file'
        );
      });
    });

    it('should replace a trailing "--" with the selected argument', async () => {
      await enterCommand(' --', { inputOnly: true });

      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getAllByRole('option').length).toBeGreaterThan(0);
      });

      const fileOption = renderResult
        .getAllByRole('option')
        .find((opt) => opt.textContent?.includes('--file'));
      expect(fileOption).toBeDefined();

      act(() => {
        fireEvent.click(fileOption!);
      });

      await waitFor(() => {
        expect(renderResult.getByTestId('test-cmdInput-leftOfCursor').textContent).toEqual(
          'cmd2 --file'
        );
      });
    });

    it('should close the popover after selecting an argument', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getAllByRole('option').length).toBeGreaterThan(0);
      });

      act(() => {
        fireEvent.click(renderResult.getAllByRole('option')[0]);
      });

      await waitFor(() => {
        expect(renderResult.queryByText('cmd2 command arguments')).toBeNull();
      });
    });

    it('should return focus to the console input after selecting an argument', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getAllByRole('option').length).toBeGreaterThan(0);
      });

      act(() => {
        fireEvent.click(renderResult.getAllByRole('option')[0]);
      });

      await waitFor(() => {
        expect(
          renderResult.getByTestId('test-keyCapture-input').querySelector('input')
        ).toHaveFocus();
      });
    });
  });

  describe('when a custom command is added', () => {
    beforeEach(() => {
      testSetup = getConsoleTestSetup();
      // Use 'aaa-' prefix so the command sorts first alphabetically and is
      // guaranteed to be in the virtualized list's initial render window
      testSetup.commands.push({
        name: 'aaa-unique-command',
        about: 'aaa unique command description',
        RenderComponent: () => null,
      } as unknown as CommandDefinition);
      renderResult = testSetup.renderConsole();
    });

    it('should include the newly added command in the options list', async () => {
      await openSelectorPopover();

      await waitFor(() => {
        expect(renderResult.getByText('Available commands')).not.toBeNull();
      });

      await waitFor(() => {
        const options = renderResult.getAllByRole('option');
        expect(options.some((opt) => opt.textContent?.includes('aaa-unique-command'))).toBe(true);
      });
    });
  });
});
