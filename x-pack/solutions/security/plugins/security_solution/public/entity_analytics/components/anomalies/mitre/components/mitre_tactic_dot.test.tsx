/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { MitreTacticDot, computeIsChipVisible, computeHaloOpacity } from './mitre_tactic_dot';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    useEuiTheme: () => ({
      euiTheme: {
        colors: {
          danger: '#cc0000',
          subduedText: '#6a6a6a',
          primary: '#0070f3',
          backgroundBasePlain: '#ffffff',
          lightShade: '#d3dae6',
        },
        size: { s: '8px' },
        levels: { content: '100' },
        font: { weight: { bold: 700, semiBold: 600 } },
      },
    }),
  };
});

// ResizeObserver is not available in JSDOM.
beforeAll(() => {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    disconnect: jest.fn(),
  }));
});

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <IntlProvider locale="en">{children}</IntlProvider>
);

const defaultProps = {
  tactic: 'Initial Access',
  detected: true,
  showLabel: false,
};

describe('MitreTacticDot', () => {
  describe('structure', () => {
    it('renders the inner and outer circle markers', () => {
      render(<MitreTacticDot {...defaultProps} />, { wrapper: Wrapper });
      expect(screen.getByTestId('mitreInnerCircle')).toBeInTheDocument();
      expect(screen.getByTestId('mitreOuterCircle')).toBeInTheDocument();
    });

    it('shows the tactic label when showLabel is true', () => {
      render(<MitreTacticDot {...defaultProps} showLabel />, { wrapper: Wrapper });
      // "Initial Access" appears in both the chip badge and the label span.
      expect(screen.getAllByText('Initial Access')).toHaveLength(2);
    });

    it('does not show the tactic label when showLabel is false', () => {
      render(<MitreTacticDot {...defaultProps} showLabel={false} />, { wrapper: Wrapper });
      // Only the chip badge renders the tactic name — no extra label element.
      expect(screen.getAllByText('Initial Access')).toHaveLength(1);
    });
  });

  describe('chip', () => {
    it('shows the tactic name in the chip badge', () => {
      render(<MitreTacticDot {...defaultProps} anomalyCount={3} />, { wrapper: Wrapper });
      // The chip badge text and any label both contain the tactic — check at least one exists.
      expect(screen.getAllByText('Initial Access').length).toBeGreaterThanOrEqual(1);
    });

    it('shows the anomaly count in the chip', () => {
      render(<MitreTacticDot {...defaultProps} anomalyCount={5} />, { wrapper: Wrapper });
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('sets chip aria-label to include tactic name and singular anomaly count', () => {
      render(
        <MitreTacticDot {...defaultProps} anomalyCount={1} isClickable onClick={jest.fn()} />,
        { wrapper: Wrapper }
      );
      // The dot's outer button carries the chip aria-label.
      expect(
        screen.getByRole('button', { name: /Initial Access.*1 anomaly/i, pressed: false })
      ).toBeInTheDocument();
    });

    it('sets chip aria-label to include tactic name and plural anomaly count', () => {
      render(
        <MitreTacticDot {...defaultProps} anomalyCount={3} isClickable onClick={jest.fn()} />,
        { wrapper: Wrapper }
      );
      expect(
        screen.getByRole('button', { name: /Initial Access.*3 anomalies/i, pressed: false })
      ).toBeInTheDocument();
    });
  });

  describe('interactivity', () => {
    it('has role="button" when isClickable and onClick are provided', () => {
      render(<MitreTacticDot {...defaultProps} isClickable onClick={jest.fn()} />, {
        wrapper: Wrapper,
      });
      // The outer container acquires role=button; aria-pressed distinguishes it from the chip button.
      expect(screen.getByRole('button', { pressed: false })).toBeInTheDocument();
    });

    it('does not render a role="button" element when not interactive', () => {
      render(<MitreTacticDot {...defaultProps} isClickable={false} />, { wrapper: Wrapper });
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('has aria-pressed=false when not selected', () => {
      render(
        <MitreTacticDot {...defaultProps} isClickable isSelected={false} onClick={jest.fn()} />,
        { wrapper: Wrapper }
      );
      expect(screen.getByRole('button', { pressed: false })).toBeInTheDocument();
    });

    it('has aria-pressed=true when selected', () => {
      render(<MitreTacticDot {...defaultProps} isClickable isSelected onClick={jest.fn()} />, {
        wrapper: Wrapper,
      });
      expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument();
    });

    it('calls onClick when the dot is clicked', () => {
      const onClick = jest.fn();
      render(<MitreTacticDot {...defaultProps} isClickable onClick={onClick} />, {
        wrapper: Wrapper,
      });
      fireEvent.click(screen.getByRole('button', { pressed: false }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick when Enter is pressed on the dot', () => {
      const onClick = jest.fn();
      render(<MitreTacticDot {...defaultProps} isClickable onClick={onClick} />, {
        wrapper: Wrapper,
      });
      fireEvent.keyDown(screen.getByRole('button', { pressed: false }), { key: 'Enter' });
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick when Space is pressed on the dot', () => {
      const onClick = jest.fn();
      render(<MitreTacticDot {...defaultProps} isClickable onClick={onClick} />, {
        wrapper: Wrapper,
      });
      fireEvent.keyDown(screen.getByRole('button', { pressed: false }), { key: ' ' });
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when isClickable is false', () => {
      const onClick = jest.fn();
      render(<MitreTacticDot {...defaultProps} isClickable={false} onClick={onClick} />, {
        wrapper: Wrapper,
      });
      // No interactive element — clicking the inner circle should not call the handler.
      fireEvent.click(screen.getByTestId('mitreInnerCircle'));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('selected state', () => {
    it('shows the clear (cross) icon in the chip when selected and interactive', () => {
      render(<MitreTacticDot {...defaultProps} isClickable isSelected onClick={jest.fn()} />, {
        wrapper: Wrapper,
      });
      expect(screen.getByTestId('mitreTacticDotV3HoverChipClear')).toBeInTheDocument();
    });

    it('does not show the clear icon when not selected', () => {
      render(
        <MitreTacticDot {...defaultProps} isClickable isSelected={false} onClick={jest.fn()} />,
        { wrapper: Wrapper }
      );
      expect(screen.queryByTestId('mitreTacticDotV3HoverChipClear')).not.toBeInTheDocument();
    });

    it('does not show the clear icon when selected but not interactive', () => {
      render(<MitreTacticDot {...defaultProps} isClickable={false} isSelected />, {
        wrapper: Wrapper,
      });
      expect(screen.queryByTestId('mitreTacticDotV3HoverChipClear')).not.toBeInTheDocument();
    });

    it('calls onClick when the clear icon is clicked', () => {
      const onClick = jest.fn();
      render(<MitreTacticDot {...defaultProps} isClickable isSelected onClick={onClick} />, {
        wrapper: Wrapper,
      });
      fireEvent.click(screen.getByTestId('mitreTacticDotV3HoverChipClear'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('hover callbacks', () => {
    it('calls onHoverChange with (tactic, true) on mouse enter', () => {
      const onHoverChange = jest.fn();
      render(<MitreTacticDot {...defaultProps} anomalyCount={2} onHoverChange={onHoverChange} />, {
        wrapper: Wrapper,
      });
      fireEvent.mouseEnter(screen.getByTestId('mitreInnerCircle').parentElement!.parentElement!);
      expect(onHoverChange).toHaveBeenCalledWith('Initial Access', true);
    });

    it('calls onHoverChange with (tactic, false) on mouse leave', () => {
      const onHoverChange = jest.fn();
      render(<MitreTacticDot {...defaultProps} anomalyCount={2} onHoverChange={onHoverChange} />, {
        wrapper: Wrapper,
      });
      const container = screen.getByTestId('mitreInnerCircle').parentElement!.parentElement!;
      fireEvent.mouseEnter(container);
      fireEvent.mouseLeave(container);
      expect(onHoverChange).toHaveBeenLastCalledWith('Initial Access', false);
    });
  });
});

describe('computeIsChipVisible', () => {
  describe('persistent default (isPersistentDefault)', () => {
    it('is visible when isPersistentDefault=true and no other dot is hovered', () => {
      expect(computeIsChipVisible(true, false, false, true, false)).toBe(true);
    });

    it('is hidden when isPersistentDefault=true but another dot is hovered', () => {
      expect(computeIsChipVisible(true, false, false, true, true)).toBe(false);
    });

    it('is hidden when isPersistentDefault=false and not hovered or selected', () => {
      // This is the case when a tactic is selected in the chain — the first-active
      // dot receives isPersistentDefault=false and should not show a default chip.
      expect(computeIsChipVisible(true, false, false, false, false)).toBe(false);
    });
  });

  describe('hover and selection always show the chip', () => {
    it('is visible when hovered, regardless of isPersistentDefault', () => {
      expect(computeIsChipVisible(true, true, false, false, false)).toBe(true);
    });

    it('is visible when selected, regardless of isPersistentDefault', () => {
      expect(computeIsChipVisible(true, false, true, false, false)).toBe(true);
    });

    it('is visible when selected even when another dot is hovered', () => {
      expect(computeIsChipVisible(true, false, true, false, true)).toBe(true);
    });
  });

  it('is always hidden when showHoverChip=false', () => {
    expect(computeIsChipVisible(false, true, true, true, false)).toBe(false);
  });
});

describe('computeHaloOpacity', () => {
  it('returns 1 when selected', () => {
    expect(computeHaloOpacity(true, false, false)).toBe(1);
  });

  it('returns 1 when detected and hovered', () => {
    expect(computeHaloOpacity(false, true, true)).toBe(1);
  });

  it('returns 0.25 when detected but not hovered or selected', () => {
    expect(computeHaloOpacity(false, true, false)).toBe(0.25);
  });

  it('returns 0 when not detected, not selected, not hovered', () => {
    expect(computeHaloOpacity(false, false, false)).toBe(0);
  });
});
