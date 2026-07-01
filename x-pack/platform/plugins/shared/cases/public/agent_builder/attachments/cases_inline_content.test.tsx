/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { applicationServiceMock } from '@kbn/core/public/mocks';
import { createCasesInlineContent, type CasesAttachment } from './cases_inline_content';
import {
  CASES_ATTACHMENT_TYPE,
  type CaseAttachmentData,
} from '../../../common/types/agent_builder/attachment_schemas';

const buildCase = (overrides: Partial<CaseAttachmentData> = {}): CaseAttachmentData => ({
  id: `c-${Math.random().toString(36).slice(2)}`,
  incremental_id: 100 + Math.floor(Math.random() * 100),
  title: 'A Case',
  description: 'desc',
  status: 'in-progress',
  severity: 'medium',
  totalAlerts: 1,
  totalComment: 1,
  tags: [],
  owner: 'securitySolution',
  assignees: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  total_observables: 0,
  ...overrides,
});

const buildAttachment = (cases: CaseAttachmentData[], total?: number): CasesAttachment => ({
  id: 'list-1',
  type: CASES_ATTACHMENT_TYPE,
  data: { cases, total: total ?? cases.length },
});

const renderInline = (attachment: CasesAttachment) => {
  const application = applicationServiceMock.createStartContract();
  const Inline = createCasesInlineContent({ application });
  return render(<Inline attachment={attachment} isSidebar={false} />);
};

describe('CasesInlineContent', () => {
  it('renders header count and case rows', () => {
    const cases = [
      buildCase({ id: '125', incremental_id: 125, title: 'Suspicious OAuth Token' }),
      buildCase({ id: '2847', incremental_id: 2847, title: 'phishing-originated theft' }),
      buildCase({ id: '2901', incremental_id: 2901, title: 'SHA256 hash' }),
    ];
    renderInline(buildAttachment(cases, 3));
    expect(screen.getByText('3 Cases')).toBeInTheDocument();
    expect(screen.getByText('Suspicious OAuth Token')).toBeInTheDocument();
    expect(screen.getByText('phishing-originated theft')).toBeInTheDocument();
    expect(screen.getByText('SHA256 hash')).toBeInTheDocument();
  });

  it('does not break when no cases passed', (cb) => {
    const cases: CaseAttachmentData[] = [];
    expect(() => {
      renderInline(buildAttachment(cases, 0));
      cb();
    }).not.toThrow();
  });

  it('renders clickable title links and badge links for each row', () => {
    const cases = [buildCase({ id: '125', incremental_id: 125, title: 'Suspicious OAuth Token' })];
    renderInline(buildAttachment(cases));
    expect(screen.getByTestId('case-attachment-row-title')).toBeInTheDocument();
    expect(screen.getByLabelText('View alerts')).toBeInTheDocument();
    expect(screen.getByLabelText('View comments')).toBeInTheDocument();
  });

  it('renders the "Go to cases" button', () => {
    renderInline(buildAttachment([buildCase()]));
    expect(screen.getByTestId('cases-attachment-go-to-cases')).toBeInTheDocument();
  });

  it('shows "Showing N of M" footer when cases exceed the 10-row limit', () => {
    const cases = Array.from({ length: 10 }, (_, i) =>
      buildCase({ id: `c${i}`, incremental_id: i + 1, title: `Case ${i}` })
    );
    renderInline(buildAttachment(cases, 12));
    expect(screen.getByText('Showing 10 of 12')).toBeInTheDocument();
  });

  it('does not show "Showing N of M" footer when total fits within the limit', () => {
    const cases = Array.from({ length: 7 }, (_, i) =>
      buildCase({ id: `c${i}`, incremental_id: i + 1, title: `Case ${i}` })
    );
    renderInline(buildAttachment(cases, 7));
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });
});
