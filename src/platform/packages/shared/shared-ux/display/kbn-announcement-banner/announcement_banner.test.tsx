/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { useEuiTheme } from '@elastic/eui';
import { fireEvent, renderHook } from '@testing-library/react';
import { renderWithEuiTheme } from '@kbn/test-jest-helpers';

import { AnnouncementBanner } from './announcement_banner';

const illustration = <img src="" alt="'" />;
const requiredProps = {
  title: 'Title',
  media: illustration,
};

describe('AnnouncementBanner', () => {
  it('renders the title', () => {
    const { getByTestId } = renderWithEuiTheme(<AnnouncementBanner {...requiredProps} />);

    expect(getByTestId('announcementBanner-title')).toHaveTextContent('Title');
  });

  it('renders text and children', () => {
    const { getByText } = renderWithEuiTheme(
      <AnnouncementBanner {...requiredProps} text="Body copy">
        <span>Extra content</span>
      </AnnouncementBanner>
    );

    expect(getByText('Body copy')).toBeInTheDocument();
    expect(getByText('Extra content')).toBeInTheDocument();
  });

  it('renders the media slot', () => {
    const { getByTestId } = renderWithEuiTheme(
      <AnnouncementBanner
        {...requiredProps}
        media={<img alt="ill" data-test-subj="illustration" />}
      />
    );
    expect(getByTestId('announcementBanner-media')).toBeInTheDocument();
    expect(getByTestId('illustration')).toBeInTheDocument();
  });

  describe('size', () => {
    it('renders as size="m" by default', () => {
      const { getByTestId } = renderWithEuiTheme(<AnnouncementBanner {...requiredProps} />);

      expect(getByTestId('announcementBanner')).toHaveAttribute('data-size', 'm');
    });

    it('renders as size="s"', () => {
      const { getByTestId } = renderWithEuiTheme(
        <AnnouncementBanner {...requiredProps} size="s" />
      );

      expect(getByTestId('announcementBanner')).toHaveAttribute('data-size', 's');
    });
  });

  describe('color', () => {
    it('renders as color="highlighted" by default', () => {
      const { result } = renderHook(() => useEuiTheme());
      const { getByTestId } = renderWithEuiTheme(<AnnouncementBanner {...requiredProps} />);

      expect(getByTestId('announcementBanner')).toHaveAttribute('data-color', 'highlighted');
      expect(getByTestId('announcementBanner')).toHaveStyleRule(
        'background-color',
        result.current.euiTheme.colors.backgroundBaseHighlighted
      );
    });

    it('renders as color="plain"', () => {
      const { result } = renderHook(() => useEuiTheme());
      const { getByTestId } = renderWithEuiTheme(
        <AnnouncementBanner {...requiredProps} color="plain" />
      );

      expect(getByTestId('announcementBanner')).toHaveAttribute('data-color', 'plain');
      expect(getByTestId('announcementBanner')).toHaveStyleRule(
        'background-color',
        result.current.euiTheme.colors.backgroundBasePlain
      );
    });
  });

  describe('onDismiss button', () => {
    it('does not render the dismiss button when onDismiss is omitted', () => {
      const { queryByTestId } = renderWithEuiTheme(<AnnouncementBanner {...requiredProps} />);

      expect(queryByTestId('announcementBanner-dismiss')).toBeNull();
    });

    it('fires onDismiss when the dismiss button is clicked', () => {
      const onDismiss = jest.fn();
      const { getByTestId } = renderWithEuiTheme(
        <AnnouncementBanner {...requiredProps} onDismiss={onDismiss} />
      );

      fireEvent.click(getByTestId('announcementBanner-dismiss'));

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('spreads dismissButtonProps onto the dismiss button', () => {
      const { getByTestId } = renderWithEuiTheme(
        <AnnouncementBanner
          {...requiredProps}
          onDismiss={() => {}}
          dismissButtonProps={{ 'aria-label': 'Close', 'data-test-subj': 'custom-dismiss' }}
        />
      );
      const button = getByTestId('custom-dismiss');

      expect(button).toHaveAttribute('aria-label', 'Close');
    });
  });

  describe('action buttons', () => {
    it('renders primary and secondary action buttons', () => {
      const { getByTestId } = renderWithEuiTheme(
        <AnnouncementBanner
          {...requiredProps}
          actionProps={{
            primary: { children: 'Primary action', onClick: () => {} },
            secondary: { children: 'Secondary action', onClick: () => {} },
          }}
        />
      );

      expect(getByTestId('announcementBanner-primaryAction')).toBeInTheDocument();
      expect(getByTestId('announcementBanner-primaryAction')).toHaveTextContent('Primary action');

      expect(getByTestId('announcementBanner-secondaryAction')).toBeInTheDocument();
      expect(getByTestId('announcementBanner-secondaryAction')).toHaveTextContent(
        'Secondary action'
      );
    });

    it('renders a standalone primary action button', () => {
      const { queryByTestId, getByTestId } = renderWithEuiTheme(
        <AnnouncementBanner
          {...requiredProps}
          actionProps={{
            primary: { children: 'Primary action', onClick: () => {} },
          }}
        />
      );

      expect(getByTestId('announcementBanner-primaryAction')).toBeInTheDocument();
      expect(getByTestId('announcementBanner-primaryAction')).toHaveTextContent('Primary action');
      expect(queryByTestId('announcementBanner-secondaryAction')).not.toBeInTheDocument();
    });

    it('does not render a standalone secondary action button', () => {
      const { queryByTestId } = renderWithEuiTheme(
        <AnnouncementBanner
          {...requiredProps}
          actionProps={{
            secondary: { children: 'Secondary action', onClick: () => {} },
          }}
        />
      );

      expect(queryByTestId('announcementBanner-actions')).not.toBeInTheDocument();
      expect(queryByTestId('announcementBanner-secondaryAction')).not.toBeInTheDocument();
    });

    it('fires primary and secondary onClick', () => {
      const primaryFn = jest.fn();
      const secondaryFn = jest.fn();
      const { getByTestId } = renderWithEuiTheme(
        <AnnouncementBanner
          {...requiredProps}
          actionProps={{
            primary: { children: 'Yes', onClick: primaryFn },
            secondary: { children: 'No', onClick: secondaryFn },
          }}
        />
      );

      fireEvent.click(getByTestId('announcementBanner-primaryAction'));
      fireEvent.click(getByTestId('announcementBanner-secondaryAction'));

      expect(primaryFn).toHaveBeenCalledTimes(1);
      expect(secondaryFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('headingElement', () => {
    it('renders the title as an h2 by default', () => {
      const { getByTestId } = renderWithEuiTheme(<AnnouncementBanner {...requiredProps} />);

      expect(getByTestId('announcementBanner-title').tagName).toBe('H2');
    });

    it('renders the title with the requested heading element', () => {
      const { getByTestId } = renderWithEuiTheme(
        <AnnouncementBanner {...requiredProps} headingElement="h4" />
      );

      expect(getByTestId('announcementBanner-title').tagName).toBe('H4');
    });
  });

  it('respects a custom data-test-subj', () => {
    const { getByTestId } = renderWithEuiTheme(
      <AnnouncementBanner {...requiredProps} data-test-subj="hero" />
    );

    expect(getByTestId('hero')).toBeInTheDocument();
    expect(getByTestId('hero-title')).toBeInTheDocument();
  });
});
