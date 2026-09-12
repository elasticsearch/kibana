/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { IndicatorFieldValue } from './field_value';
import {
  RawIndicatorFieldId,
  generateMockIndicator,
  generateMockIndicatorWithTlp,
} from '../../../../../../common/threat_intelligence/types/indicator';
import { EMPTY_VALUE } from '../../../../constants/common';
import { TestProvidersComponent } from '../../../../mocks/test_providers';

const mockIndicator = generateMockIndicator();

describe('<IndicatorField />', () => {
  beforeEach(() => {});

  it('should return non formatted value', () => {
    const mockField = 'threat.indicator.ip';
    const { asFragment } = render(
      <IndicatorFieldValue indicator={mockIndicator} field={mockField} />
    );
    expect(asFragment()).toMatchInlineSnapshot(`
      <DocumentFragment>
        <div
          class="css-kj32bh-values"
        >
          <span>
            0.0.0.0
          </span>
        </div>
      </DocumentFragment>
    `);
  });

  it(`should return ${EMPTY_VALUE}`, () => {
    const mockField = 'abc';
    const { asFragment } = render(
      <IndicatorFieldValue indicator={mockIndicator} field={mockField} />
    );
    expect(asFragment()).toMatchInlineSnapshot(`
      <DocumentFragment>
        -
      </DocumentFragment>
    `);
  });

  it('should return date-formatted value', () => {
    const mockField = 'threat.indicator.first_seen';
    const { asFragment } = render(
      <TestProvidersComponent>
        <IndicatorFieldValue indicator={mockIndicator} field={mockField} />
      </TestProvidersComponent>
    );
    expect(asFragment()).toMatchInlineSnapshot(`
      <DocumentFragment>
        Jan 1, 2022 @ 01:01:01.000
      </DocumentFragment>
    `);
  });

  it('should render tlp marking badge', () => {
    const mockField = 'threat.indicator.marking.tlp';
    const { asFragment } = render(
      <TestProvidersComponent>
        <IndicatorFieldValue indicator={generateMockIndicatorWithTlp()} field={mockField} />
      </TestProvidersComponent>
    );
    expect(asFragment()).toMatchInlineSnapshot(`
      <DocumentFragment>
        <span
          class="euiBadge emotion-euiBadge-danger"
          title="Red"
        >
          <span
            class="euiBadge__content emotion-euiBadge__content"
          >
            <span
              class="euiBadge__text emotion-euiBadge__text"
            >
              Red
            </span>
          </span>
        </span>
      </DocumentFragment>
    `);
  });

  it('should render multiple values', () => {
    const mockField = RawIndicatorFieldId.NameOrigin;

    const { asFragment } = render(
      <IndicatorFieldValue indicator={mockIndicator} field={mockField} />
    );

    expect(asFragment()).toMatchInlineSnapshot(`
      <DocumentFragment>
        <div
          class="css-kj32bh-values"
        >
          <span>
            forwarded
          </span>
          <span>
            abusech-malware
          </span>
        </div>
      </DocumentFragment>
    `);
  });
});
