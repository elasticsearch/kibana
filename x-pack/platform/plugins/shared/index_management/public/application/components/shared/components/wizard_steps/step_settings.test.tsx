/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { docLinksServiceMock } from '@kbn/core/public/mocks';

import { LOOKUP_INDEX_MODE, STANDARD_INDEX_MODE } from '../../../../../../common/constants';
import type { IndexMode } from '../../../../../../common/types';
import { documentationService } from '../../../mappings_editor/shared_imports';
import { StepSettings } from './step_settings';

jest.mock('../../../../../shared_imports', () => {
  const actual = jest.requireActual('../../../../../shared_imports');
  return {
    ...actual,
    Forms: {
      ...actual.Forms,
      useFormWizardContext: () => ({ navigateToStep: jest.fn() }),
    },
  };
});

jest.mock('@kbn/code-editor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      data-test-subj="mockCodeEditor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe('StepSettings', () => {
  const renderStep = (defaultValue: object, indexMode?: IndexMode) => {
    const onChange = jest.fn();
    render(
      <I18nProvider>
        <StepSettings
          defaultValue={defaultValue}
          onChange={onChange}
          esDocsBase=""
          indexMode={indexMode}
        />
      </I18nProvider>
    );
    return onChange;
  };

  beforeAll(() => {
    documentationService.setup(docLinksServiceMock.createStartContract());
  });

  describe('WHEN the index mode is lookup', () => {
    it('SHOULD warn about a nested index.lifecycle.name without blocking the step', async () => {
      const onChange = renderStep(
        { index: { lifecycle: { name: 'my-policy' } } },
        LOOKUP_INDEX_MODE
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
      await waitFor(() => expect(onChange).toHaveBeenCalled());
      expect(onChange.mock.calls.at(-1)?.[0].isValid).toBe(true);
    });

    it('SHOULD warn about a flat index.lifecycle.name', () => {
      renderStep({ 'index.lifecycle.name': 'another-policy' }, LOOKUP_INDEX_MODE);

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when index.lifecycle.name omits the optional index prefix', () => {
      renderStep({ lifecycle: { name: 'my-policy' } }, LOOKUP_INDEX_MODE);

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when the unprefixed lifecycle name uses dotted notation', () => {
      renderStep({ 'lifecycle.name': 'my-policy' }, LOOKUP_INDEX_MODE);

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when the nested lifecycle name uses dotted notation', () => {
      renderStep({ index: { 'lifecycle.name': 'my-policy' } }, LOOKUP_INDEX_MODE);

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when the dotted index.lifecycle key contains the policy name', () => {
      renderStep({ 'index.lifecycle': { name: 'my-policy' } }, LOOKUP_INDEX_MODE);

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when lookup mode and lifecycle omit the optional index prefix', () => {
      renderStep({ mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } });

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when lookup mode and the lifecycle policy are set in the JSON editor', () => {
      renderStep({});

      fireEvent.change(screen.getByTestId('mockCodeEditor'), {
        target: {
          value: JSON.stringify({
            index: { mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } },
          }),
        },
      });

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when lookup mode and the lifecycle policy use flat settings', () => {
      renderStep({
        'index.mode': LOOKUP_INDEX_MODE,
        'index.lifecycle.name': 'my-policy',
      });

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD use nested mode when flat mode conflicts', () => {
      renderStep({
        index: { mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } },
        'index.mode': STANDARD_INDEX_MODE,
      });

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD use flat mode when unprefixed mode conflicts', () => {
      renderStep({
        'index.mode': LOOKUP_INDEX_MODE,
        mode: STANDARD_INDEX_MODE,
        'index.lifecycle.name': 'my-policy',
      });

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD handle invalid JSON without rendering the lookup warning', () => {
      renderStep({});

      fireEvent.change(screen.getByTestId('mockCodeEditor'), {
        target: { value: '{ "index":' },
      });

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });

    it('SHOULD NOT warn without a lifecycle setting', () => {
      renderStep({ index: { number_of_shards: 1 } }, LOOKUP_INDEX_MODE);

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });

    it('SHOULD still reject a number_of_shards other than 1', async () => {
      const onChange = renderStep({ index: { number_of_shards: 2 } }, LOOKUP_INDEX_MODE);

      expect(
        await screen.findByText('Number of shards for lookup index mode can only be 1 or unset.')
      ).toBeInTheDocument();
      expect(onChange.mock.calls.at(-1)?.[0].isValid).toBe(false);
    });
  });

  describe('WHEN the index mode is standard', () => {
    it('SHOULD NOT warn about index.lifecycle.name', () => {
      renderStep({ index: { lifecycle: { name: 'my-policy' } } }, STANDARD_INDEX_MODE);

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });

    it('SHOULD prefer the Logistics mode over a conflicting JSON mode', () => {
      renderStep(
        {
          index: { mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } },
        },
        STANDARD_INDEX_MODE
      );

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });

    it.each([
      [
        'flat',
        {
          'index.mode': LOOKUP_INDEX_MODE,
          'index.lifecycle.name': 'my-policy',
        },
      ],
      [
        'unprefixed',
        {
          mode: LOOKUP_INDEX_MODE,
          lifecycle: { name: 'my-policy' },
        },
      ],
    ])('SHOULD prefer the Logistics mode over conflicting %s settings', (_, settings) => {
      renderStep(settings, STANDARD_INDEX_MODE);

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });
  });
});
