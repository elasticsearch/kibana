/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Status } from './status';

jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    useEuiTheme: () => ({
      euiTheme: {
        colors: {
          backgroundBaseSubdued: '#f5f7fa',
          text: '#343741',
        },
      },
    }),
  };
});

describe('Status', () => {
  describe('loading states', () => {
    it('should show progress bar for pending status', () => {
      render(<Status status="pending" phase="mapping_to_ecs" />);

      expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
      expect(screen.getByText('Mapping to ECS')).toBeInTheDocument();
    });

    it('should show progress bar for processing status', () => {
      render(<Status status="processing" phase="building_pipeline" />);

      expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
      expect(screen.getByText('Building ingest pipeline')).toBeInTheDocument();
    });

    it('should fall back to analyzing label when phase is missing', () => {
      render(<Status status="processing" />);

      expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
      expect(screen.getByText('Analyzing')).toBeInTheDocument();
    });

    it('should show spinner when isDeleting is true', () => {
      render(<Status status="completed" isDeleting />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByText('Deleting...')).toBeInTheDocument();
    });
  });

  describe('completed states', () => {
    it('should show success icon for completed status', () => {
      render(<Status status="completed" />);

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
    });

    it('should show failed icon for failed status', () => {
      render(<Status status="failed" />);

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('should show cancelled icon for cancelled status', () => {
      render(<Status status="cancelled" />);

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  describe('isDeleting prop', () => {
    it('should override status text when isDeleting is true', () => {
      render(<Status status="completed" isDeleting />);

      expect(screen.getByText('Deleting...')).toBeInTheDocument();
      expect(screen.queryByText('Success')).not.toBeInTheDocument();
    });

    it('should show spinner even for completed status when isDeleting', () => {
      render(<Status status="completed" isDeleting />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should default isDeleting to false', () => {
      render(<Status status="completed" />);

      expect(screen.queryByText('Deleting...')).not.toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
    });
  });
});
