/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import moment from 'moment-timezone';
import { fireEvent, render, screen, waitFor, act, within } from '@testing-library/react';
import { renderWithEuiTheme } from '@kbn/test-jest-helpers';
import { EuiThemeProvider } from '@elastic/eui';

import { FOCUSABLE_SELECTOR } from './constants';
import { DateRangePicker, type DateRangePickerProps } from './date_range_picker';

const defaultProps: DateRangePickerProps = {
  defaultValue: 'last 20 minutes',
  onChange: () => {},
  settings: { roundRelativeTime: false },
  onSettingsChange: () => {},
};

const openEditing = () => {
  fireEvent.click(screen.getByTestId('dateRangePickerControlButton'));
  return screen.getByTestId('dateRangePickerInput');
};

/** Flush EuiPopover's internal 250ms close-transition setTimeout. */
const waitForPopoverClose = () =>
  waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

describe('DateRangePickerControl', () => {
  // Pin to UTC so date formatting is deterministic across local machines and CI agents.
  beforeEach(() => {
    moment.tz.setDefault('UTC');
  });

  afterEach(() => {
    moment.tz.setDefault('Browser');
  });

  describe('editing mode', () => {
    it('enters editing mode on control button click', async () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} onChange={() => {}} />);

      expect(screen.getByTestId('dateRangePickerControlButton')).toBeInTheDocument();
      expect(screen.queryByTestId('dateRangePickerInput')).not.toBeInTheDocument();

      const input = openEditing();

      expect(input).toHaveFocus();
      expect(screen.queryByTestId('dateRangePickerControlButton')).not.toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });
      await waitForPopoverClose();
    });

    it('selects the clicked display part in the input', async () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} onChange={() => {}} />);

      const displayPart = screen.getByText('20');
      fireEvent.mouseDown(displayPart);
      fireEvent.click(displayPart);

      const input = await screen.findByTestId('dateRangePickerInput');
      await waitFor(() => {
        expect(input).toHaveFocus();
        expect((input as HTMLInputElement).selectionStart).toBe(5);
        expect((input as HTMLInputElement).selectionEnd).toBe(7);
      });

      fireEvent.keyDown(input, { key: 'Escape' });
      await waitForPopoverClose();
    });

    it.each([
      ['Next', '+'],
      ['days', 'd'],
    ])(
      'selects the clicked future relative "%s" display part in the input',
      async (text, selected) => {
        renderWithEuiTheme(
          <DateRangePicker {...defaultProps} defaultValue="+4d" onChange={() => {}} />
        );

        const displayPart = screen.getByText(text);
        fireEvent.mouseDown(displayPart);
        fireEvent.click(displayPart);

        const input = (await screen.findByTestId('dateRangePickerInput')) as HTMLInputElement;
        await waitFor(() => {
          expect(input).toHaveFocus();
          expect(input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0)).toBe(
            selected
          );
        });

        fireEvent.keyDown(input, { key: 'Escape' });
        await waitForPopoverClose();
      }
    );

    it('saves a relative range with its human-readable display label, not the raw input', async () => {
      const onPresetSave = jest.fn();

      renderWithEuiTheme(
        <DateRangePicker {...defaultProps} defaultValue="-2m" onPresetSave={onPresetSave} />
      );

      openEditing();
      fireEvent.click(screen.getByTestId('dateRangePickerSavePresetButton'));

      expect(onPresetSave).toHaveBeenCalledWith({
        start: 'now-2m',
        end: 'now',
        label: 'Last 2 minutes',
      });

      await waitForPopoverClose();
    });

    it('derives readable input from bounds when selecting a preset with a display-only label', async () => {
      const expectedInputText = 'May 1, 2026, 00:00:00.000 to May 2, 2026, 23:59:00.000';

      renderWithEuiTheme(
        <DateRangePicker
          {...defaultProps}
          defaultValue="last 20 minutes"
          settings={{ roundRelativeTime: false, timePrecision: 'none' }}
          presets={[
            {
              start: '2026-05-01T00:00:00.000Z',
              end: '2026-05-02T23:59:00.000Z',
              label: 'May 1, 00:00 → May 2, 23:59',
            },
          ]}
        />
      );

      const input = openEditing();
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.click(screen.getByText('May 1, 00:00 → May 2, 23:59'));

      const selectedInput = openEditing() as HTMLInputElement;

      expect(selectedInput.value).toBe(expectedInputText);
      fireEvent.keyDown(selectedInput, { key: 'Escape' });
      await waitForPopoverClose();
    });

    it('selects clicked no-year absolute display parts in the input', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-04T12:00:00.000Z'));

      try {
        renderWithEuiTheme(
          <DateRangePicker
            {...defaultProps}
            defaultValue="-4d to Jun 4, 2026, 00:00"
            onChange={() => {}}
          />
        );
        jest.useRealTimers();

        const displayPart = screen.getAllByText('00')[0];
        fireEvent.mouseDown(displayPart);
        fireEvent.click(displayPart);

        const input = (await screen.findByTestId('dateRangePickerInput')) as HTMLInputElement;
        await waitFor(() => {
          expect(input).toHaveFocus();
          expect(input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0)).toBe('00');
        });

        fireEvent.keyDown(input, { key: 'Escape' });
        await waitForPopoverClose();
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps the clicked display part visible when the input is scrolled', async () => {
      const animationFrameCallbacks: FrameRequestCallback[] = [];
      const requestAnimationFrameSpy = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          animationFrameCallbacks.push(callback);
          return animationFrameCallbacks.length;
        });
      const cancelAnimationFrameSpy = jest
        .spyOn(window, 'cancelAnimationFrame')
        .mockImplementation(() => {});
      const getContextSpy = jest
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockReturnValue(null);

      try {
        renderWithEuiTheme(
          <DateRangePicker
            {...defaultProps}
            defaultValue="2024-01-01T00:00:00.000Z to 2024-12-31T23:59:59.999Z"
            onChange={() => {}}
          />
        );

        // Both sides of the range render "2024"; pick the start-side year, matching the selection assertion below.
        const displayPart = screen.getAllByText('2024')[0];
        fireEvent.mouseDown(displayPart);
        fireEvent.click(displayPart);

        const input = (await screen.findByTestId('dateRangePickerInput')) as HTMLInputElement;
        await waitFor(() => {
          expect(input.selectionStart).toBe(7);
          expect(input.selectionEnd).toBe(11);
        });
        Object.defineProperty(input, 'clientWidth', { configurable: true, value: 80 });
        Object.defineProperty(input, 'scrollWidth', { configurable: true, value: 800 });
        input.scrollLeft = 720;

        act(() => {
          for (const callback of animationFrameCallbacks) {
            callback(performance.now());
          }
        });

        expect(input.scrollLeft).toBeLessThan(200);

        fireEvent.keyDown(input, { key: 'Escape' });
        await waitForPopoverClose();
      } finally {
        requestAnimationFrameSpy.mockRestore();
        cancelAnimationFrameSpy.mockRestore();
        getContextSpy.mockRestore();
      }
    });

    it('submits on Enter and returns to idle mode', async () => {
      const onChange = jest.fn();
      renderWithEuiTheme(<DateRangePicker {...defaultProps} onChange={onChange} />);

      const input = openEditing();

      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('dateRangePickerControlButton')).toBeInTheDocument();
      expect(screen.queryByTestId('dateRangePickerInput')).not.toBeInTheDocument();
      await waitForPopoverClose();
    });

    it('cancels on Escape and returns to idle mode', async () => {
      const onChange = jest.fn();
      renderWithEuiTheme(<DateRangePicker {...defaultProps} onChange={onChange} />);

      const input = openEditing();

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('dateRangePickerControlButton')).toBeInTheDocument();
      expect(screen.queryByTestId('dateRangePickerInput')).not.toBeInTheDocument();
      await waitForPopoverClose();
    });

    it('restores previous text on Escape after typing', async () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} />);

      const input = openEditing();

      fireEvent.change(input, { target: { value: 'something else' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      const button = screen.getByTestId('dateRangePickerControlButton');
      expect(button).toHaveTextContent('Last 20 minutes');
      await waitForPopoverClose();
    });

    it('calls onInputChange when typing and clearing input', async () => {
      const onInputChange = jest.fn();
      renderWithEuiTheme(<DateRangePicker {...defaultProps} onInputChange={onInputChange} />);

      const input = openEditing();
      fireEvent.change(input, { target: { value: 'last 15 minutes' } });

      expect(onInputChange).toHaveBeenCalledWith('last 15 minutes');

      fireEvent.click(screen.getByLabelText('Clear input'));
      expect(onInputChange).toHaveBeenCalledWith('');

      fireEvent.keyDown(screen.getByTestId('dateRangePickerInput'), { key: 'Escape' });
      await waitForPopoverClose();
    });

    it('closes on outside click and returns to idle mode', async () => {
      const onChange = jest.fn();
      renderWithEuiTheme(<DateRangePicker {...defaultProps} onChange={onChange} />);

      openEditing();

      fireEvent.mouseDown(document.body);
      fireEvent.mouseUp(document.body);

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('dateRangePickerControlButton')).toBeInTheDocument();
      expect(screen.queryByTestId('dateRangePickerInput')).not.toBeInTheDocument();
      await waitForPopoverClose();
    });

    it('exits editing and restores text on Shift+Tab from the first tabbable', async () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} />);

      const input = openEditing();
      fireEvent.change(input, { target: { value: 'something else' } });
      fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });

      expect(screen.getByTestId('dateRangePickerControlButton')).toHaveTextContent(
        'Last 20 minutes'
      );
      expect(screen.queryByTestId('dateRangePickerInput')).not.toBeInTheDocument();
      await waitForPopoverClose();
    });

    it('exits editing and restores text on Tab from the last tabbable', async () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} />);

      const input = openEditing();
      fireEvent.change(input, { target: { value: 'something else' } });

      const clearButton = screen.getByLabelText('Clear input');
      clearButton.focus();
      fireEvent.keyDown(clearButton, { key: 'Tab' });

      expect(screen.getByTestId('dateRangePickerControlButton')).toHaveTextContent(
        'Last 20 minutes'
      );
      expect(screen.queryByTestId('dateRangePickerInput')).not.toBeInTheDocument();
      await waitForPopoverClose();
    });

    it.each(['ArrowDown', 'ArrowUp'] as const)(
      'moves focus into the dialog on %s and back to button on Escape',
      async (arrowKey) => {
        renderWithEuiTheme(<DateRangePicker {...defaultProps} />);

        const input = openEditing();
        fireEvent.keyDown(input, { key: arrowKey });

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveFocus();

        fireEvent.keyDown(dialog, { key: 'Escape' });

        expect(screen.getByTestId('dateRangePickerControlButton')).toHaveFocus();
        await waitForPopoverClose();
      }
    );

    it('traps focus within the dialog panel on Tab', async () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} />);

      const input = openEditing();
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      const dialog = screen.getByRole('dialog');
      const tabbables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      expect(tabbables.length).toBeGreaterThan(0);

      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];

      last.focus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(first).toHaveFocus();

      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
      expect(last).toHaveFocus();

      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitForPopoverClose();
    });

    it('opens popover when entering editing mode and closes it when exiting', async () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      const input = openEditing();

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('collapsed prop', () => {
    describe('collapsed=false (default)', () => {
      it('shows the text label', () => {
        renderWithEuiTheme(<DateRangePicker {...defaultProps} />);

        const button = screen.getByTestId('dateRangePickerControlButton');
        expect(button).not.toHaveAttribute('aria-label');
        expect(button).toHaveTextContent('Last 20 minutes');
      });

      it('hides the duration badge for relative-to-now ranges', () => {
        renderWithEuiTheme(<DateRangePicker {...defaultProps} defaultValue="last 20 minutes" />);
        expect(screen.queryByTestId('dateRangePickerDurationBadge')).not.toBeInTheDocument();
      });

      it('shows the duration badge for non-relative-to-now ranges', () => {
        renderWithEuiTheme(
          <DateRangePicker {...defaultProps} defaultValue="2024-01-01 to 2024-02-01" />
        );
        expect(screen.getByTestId('dateRangePickerDurationBadge')).toBeInTheDocument();
      });
    });

    describe('collapsed=true', () => {
      it('hides the text label and sets aria-label', () => {
        renderWithEuiTheme(<DateRangePicker {...defaultProps} collapsed />);

        const button = screen.getByTestId('dateRangePickerControlButton');
        expect(button).toHaveAttribute('aria-label');
        expect(button).not.toHaveTextContent('Last 20 minutes');
      });

      it('shows the duration badge for non-relative-to-now ranges', () => {
        renderWithEuiTheme(
          <DateRangePicker {...defaultProps} collapsed defaultValue="2024-01-01 to 2024-02-01" />
        );
        expect(screen.getByTestId('dateRangePickerDurationBadge')).toBeInTheDocument();
      });

      it('shows the duration badge for relative-to-now ranges', () => {
        renderWithEuiTheme(<DateRangePicker {...defaultProps} collapsed />);
        expect(screen.getByTestId('dateRangePickerDurationBadge')).toBeInTheDocument();
      });
    });
  });

  describe('disabled prop', () => {
    it('disables the control button and suppresses tooltip', () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} disabled />);

      const button = screen.getByTestId('dateRangePickerControlButton');
      expect(button).toBeDisabled();

      fireEvent.mouseOver(button);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('does not enter editing mode when disabled', () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} disabled />);

      fireEvent.click(screen.getByTestId('dateRangePickerControlButton'));
      expect(screen.queryByTestId('dateRangePickerInput')).not.toBeInTheDocument();
    });
  });

  describe('controlled mode (value prop)', () => {
    const controlledDefaults = {
      settings: { roundRelativeTime: false },
      onSettingsChange: () => {},
    } as const;

    const renderPicker = (props: DateRangePickerProps) =>
      renderWithEuiTheme(<DateRangePicker {...props} />);

    it('renders with initial value', () => {
      renderPicker({ value: 'last 20 minutes', onChange: () => {}, ...controlledDefaults });
      expect(screen.getByTestId('dateRangePickerControlButton')).toHaveTextContent(
        'Last 20 minutes'
      );
    });

    it('updates displayed text when value changes while idle', async () => {
      const { rerender } = renderPicker({
        value: 'last 20 minutes',
        onChange: () => {},
        ...controlledDefaults,
      });
      expect(screen.getByTestId('dateRangePickerControlButton')).toHaveTextContent(
        'Last 20 minutes'
      );

      rerender(
        <EuiThemeProvider>
          <DateRangePicker value="last 1 hour" onChange={() => {}} {...controlledDefaults} />
        </EuiThemeProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId('dateRangePickerControlButton')).toHaveTextContent('Last 1 hour');
      });
    });

    it('does not overwrite user input when value changes during editing', async () => {
      const { rerender } = renderPicker({
        value: 'last 20 minutes',
        onChange: () => {},
        ...controlledDefaults,
      });
      const input = openEditing();
      fireEvent.change(input, { target: { value: 'last 5 minutes' } });
      expect(input).toHaveValue('last 5 minutes');

      rerender(
        <EuiThemeProvider>
          <DateRangePicker value="last 1 hour" onChange={() => {}} {...controlledDefaults} />
        </EuiThemeProvider>
      );
      await waitFor(() => {
        expect(input).toHaveValue('last 5 minutes');
      });

      fireEvent.keyDown(input, { key: 'Escape' });
      await waitForPopoverClose();
    });

    it('restores to latest value on cancel after external value change during editing', async () => {
      const { rerender } = renderPicker({
        value: 'last 20 minutes',
        onChange: () => {},
        ...controlledDefaults,
      });
      const input = openEditing();
      fireEvent.change(input, { target: { value: 'something typed' } });

      await act(async () =>
        rerender(
          <EuiThemeProvider>
            <DateRangePicker value="last 1 hour" onChange={() => {}} {...controlledDefaults} />
          </EuiThemeProvider>
        )
      );
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.getByTestId('dateRangePickerControlButton')).toHaveTextContent('Last 1 hour');
      await waitForPopoverClose();
    });

    it('calls onChange on Enter in controlled mode', async () => {
      const onChange = jest.fn();
      renderPicker({ value: 'last 20 minutes', onChange, ...controlledDefaults });

      const input = openEditing();
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('dateRangePickerControlButton')).toBeInTheDocument();
      await waitForPopoverClose();
    });

    it('preserves text when controlled value is removed', () => {
      const Harness = () => {
        const [controlled, setControlled] = useState(true);
        return (
          <EuiThemeProvider>
            <button data-test-subj="toggle" onClick={() => setControlled(false)} />
            <DateRangePicker
              {...(controlled ? { value: 'last 1 hour' } : {})}
              onChange={() => {}}
              settings={{ roundRelativeTime: false }}
              onSettingsChange={() => {}}
            />
          </EuiThemeProvider>
        );
      };
      render(<Harness />);
      expect(screen.getByTestId('dateRangePickerControlButton')).toHaveTextContent('Last 1 hour');

      fireEvent.click(screen.getByTestId('toggle'));
      expect(screen.getByTestId('dateRangePickerControlButton')).toHaveTextContent('Last 1 hour');
    });
  });

  describe('width prop', () => {
    it('auto (default)', () => {
      const { container } = renderWithEuiTheme(<DateRangePicker {...defaultProps} />);
      const computedStyles = getComputedStyle(container.firstElementChild!);
      expect(computedStyles.display).toBe('inline-flex');
      expect(computedStyles.inlineSize).toBe('auto');
    });

    it('restricted', () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} width="restricted" />);
      const wrapper = screen.getByTestId('dateRangePickerControlWrapper');
      expect(wrapper).toHaveStyle({
        'inline-size': 'var(--kbnDateRangePickerWidthRestricted, 21.25rem)',
      });
    });

    it('full', () => {
      const { container } = renderWithEuiTheme(<DateRangePicker {...defaultProps} width="full" />);
      expect(container.firstElementChild).toHaveStyle({ display: 'flex', 'inline-size': '100%' });
      const popover = screen.getByTestId('dateRangePickerPopoverTriggerWrapper');
      expect(popover).toHaveStyle({ 'inline-size': '100%' });
    });
  });

  describe('isLoading prop', () => {
    it('shows a loading spinner when isLoading is true', () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} isLoading />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('does not show a spinner when isLoading is false (default)', () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  describe('layout passthrough props', () => {
    it('passes className to the outer container', () => {
      const { container } = renderWithEuiTheme(
        <DateRangePicker {...defaultProps} className="my-custom-class" />
      );
      expect(container.firstElementChild).toHaveClass('my-custom-class');
    });

    it('passes data-test-subj to the outer container', () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} data-test-subj="myPicker" />);
      expect(screen.getByTestId('myPicker')).toBeInTheDocument();
    });
  });

  describe('badge fallback', () => {
    it('renders "--" when the duration cannot be computed', () => {
      renderWithEuiTheme(<DateRangePicker {...defaultProps} defaultValue="invalid input" />);
      const button = screen.getByTestId('dateRangePickerControlButton');
      const badge = within(button).getByText('--');
      expect(badge).toBeInTheDocument();
    });

    it('renders a duration label when the range is valid and not relative-to-now', () => {
      renderWithEuiTheme(
        <DateRangePicker {...defaultProps} defaultValue="2024-01-01 to 2024-02-01" />
      );
      const button = screen.getByTestId('dateRangePickerControlButton');
      const badge = within(button).getByTestId('dateRangePickerDurationBadge');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('roundRelativeTime', () => {
    it('applies rounding to the start date when selecting a preset', async () => {
      const onChange = jest.fn();
      renderWithEuiTheme(
        <DateRangePicker
          defaultValue="last 20 minutes"
          onChange={onChange}
          settings={{ roundRelativeTime: true }}
          onSettingsChange={() => {}}
          presets={[{ start: 'now-15m', end: 'now', label: 'Last 15 minutes' }]}
        />
      );

      const input = openEditing();
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      const preset = screen.getByTestId('dateRangePickerPresetItem-Last_15_minutes');
      fireEvent.click(within(preset).getByRole('button'));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ start: 'now-15m/m', end: 'now' })
      );
      await waitForPopoverClose();
    });
  });

  describe('auto-refresh', () => {
    const onRefresh = jest.fn();

    beforeEach(() => {
      jest.useFakeTimers();
      onRefresh.mockClear();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const autoRefreshSettings = {
      roundRelativeTime: true,
      autoRefresh: { isEnabled: true, isPaused: false, intervalMs: 4000, intervalDisplayUnit: 's' },
    } as const;

    it('does not render the auto-refresh append control when `settings.autoRefresh` is absent', () => {
      renderWithEuiTheme(
        <DateRangePicker {...defaultProps} settings={{ roundRelativeTime: true }} />
      );

      expect(screen.queryByTestId('dateRangePickerAutoRefreshButton')).not.toBeInTheDocument();
    });

    it('does not render the auto-refresh append control when `onRefresh` is absent', () => {
      renderWithEuiTheme(
        <DateRangePicker {...defaultProps} settings={{ ...autoRefreshSettings }} />
      );

      expect(screen.queryByTestId('dateRangePickerAutoRefreshButton')).not.toBeInTheDocument();
    });

    it('does not render the auto-refresh append control when `settings.autoRefresh.isEnabled` is false', () => {
      renderWithEuiTheme(
        <DateRangePicker
          {...defaultProps}
          onRefresh={onRefresh}
          settings={{
            roundRelativeTime: true,
            autoRefresh: {
              isEnabled: false,
              isPaused: false,
              intervalMs: 4000,
              intervalDisplayUnit: 's',
            },
          }}
        />
      );

      expect(screen.queryByTestId('dateRangePickerAutoRefreshButton')).not.toBeInTheDocument();
    });

    it('shows the auto-refresh append control when `settings.autoRefresh.isPaused` is true (play to resume)', () => {
      renderWithEuiTheme(
        <DateRangePicker
          {...defaultProps}
          onRefresh={onRefresh}
          settings={{
            roundRelativeTime: true,
            autoRefresh: {
              isEnabled: true,
              isPaused: true,
              intervalMs: 4000,
              intervalDisplayUnit: 's',
            },
          }}
        />
      );

      expect(screen.getByTestId('dateRangePickerAutoRefreshButton')).toBeInTheDocument();
    });

    it('shows mm:ss countdown on the auto-refresh append control while idle when `settings.autoRefresh` is set', () => {
      renderWithEuiTheme(
        <DateRangePicker
          {...defaultProps}
          onRefresh={onRefresh}
          settings={{ ...autoRefreshSettings }}
        />
      );

      const refreshBtn = screen.getByTestId('dateRangePickerAutoRefreshButton');

      expect(refreshBtn).toBeInTheDocument();
      expect(refreshBtn).toHaveTextContent('00:04');
    });

    it('shows the auto-refresh append control while editing when `settings.autoRefresh` is set', async () => {
      renderWithEuiTheme(
        <DateRangePicker
          {...defaultProps}
          onRefresh={onRefresh}
          settings={{ ...autoRefreshSettings }}
        />
      );

      openEditing();

      expect(screen.getByTestId('dateRangePickerAutoRefreshButton')).toBeInTheDocument();

      fireEvent.keyDown(screen.getByTestId('dateRangePickerInput'), { key: 'Escape' });

      await waitForPopoverClose();
    });

    it('calls `onSettingsChange` when the auto-refresh append control is clicked', async () => {
      const onSettingsChange = jest.fn();

      renderWithEuiTheme(
        <DateRangePicker
          {...defaultProps}
          onRefresh={onRefresh}
          settings={{ ...autoRefreshSettings }}
          onSettingsChange={onSettingsChange}
        />
      );

      openEditing();

      fireEvent.click(screen.getByTestId('dateRangePickerAutoRefreshButton'));

      expect(onSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          autoRefresh: expect.objectContaining({ isPaused: true }),
        })
      );

      fireEvent.keyDown(screen.getByTestId('dateRangePickerInput'), { key: 'Escape' });

      await waitForPopoverClose();
    });

    it('calls `onRefresh` on each interval while `settings.autoRefresh` is active', () => {
      const tickOnRefresh = jest.fn();

      renderWithEuiTheme(
        <DateRangePicker
          {...defaultProps}
          settings={{ ...autoRefreshSettings }}
          onRefresh={tickOnRefresh}
        />
      );

      act(() => {
        jest.advanceTimersByTime(4000);
      });

      expect(tickOnRefresh).toHaveBeenCalledTimes(1);
      expect(tickOnRefresh).toHaveBeenLastCalledWith();

      act(() => {
        jest.advanceTimersByTime(4000);
      });

      expect(tickOnRefresh).toHaveBeenCalledTimes(2);
      expect(tickOnRefresh).toHaveBeenLastCalledWith();
    });

    it('does not call `onRefresh` while `settings.autoRefresh.isPaused` is true', () => {
      const pausedOnRefresh = jest.fn();

      renderWithEuiTheme(
        <DateRangePicker
          {...defaultProps}
          settings={{
            roundRelativeTime: true,
            autoRefresh: {
              isEnabled: true,
              isPaused: true,
              intervalMs: 1000,
              intervalDisplayUnit: 's',
            },
          }}
          onRefresh={pausedOnRefresh}
        />
      );

      act(() => {
        jest.advanceTimersByTime(10_000);
      });

      expect(pausedOnRefresh).not.toHaveBeenCalled();
    });

    it('does not call `onRefresh` while `settings.autoRefresh.isEnabled` is false', () => {
      const disabledOnRefresh = jest.fn();

      renderWithEuiTheme(
        <DateRangePicker
          {...defaultProps}
          settings={{
            roundRelativeTime: true,
            autoRefresh: {
              isEnabled: false,
              isPaused: false,
              intervalMs: 1000,
              intervalDisplayUnit: 's',
            },
          }}
          onRefresh={disabledOnRefresh}
        />
      );

      act(() => {
        jest.advanceTimersByTime(10_000);
      });

      expect(disabledOnRefresh).not.toHaveBeenCalled();
    });
  });
});
