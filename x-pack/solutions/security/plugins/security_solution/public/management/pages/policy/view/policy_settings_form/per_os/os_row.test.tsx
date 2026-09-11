/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { OS_TITLES } from '../../../../../common/translations';
import { OsRow } from './os_row';

describe('OsRow', () => {
  const testSubj = 'osRow';

  it.each([OperatingSystem.WINDOWS, OperatingSystem.MAC, OperatingSystem.LINUX])(
    'renders the OS_TITLES label for %s',
    (os) => {
      const render = createAppRootMockRenderer();
      const result = render.render(
        <OsRow os={os} primaryControl={<span>{'primary'}</span>} data-test-subj={testSubj} />
      );

      expect(result.getByTestId(testSubj)).toHaveTextContent(OS_TITLES[os]);
    }
  );

  it('uses the same design-fixed OS label column for every row', () => {
    const render = createAppRootMockRenderer();
    const result = render.render(
      <>
        <OsRow
          os={OperatingSystem.WINDOWS}
          primaryControl={<span>{'Windows control'}</span>}
          data-test-subj="windowsRow"
        />
        <OsRow
          os={OperatingSystem.MAC}
          primaryControl={<span>{'Mac control'}</span>}
          data-test-subj="macRow"
        />
        <OsRow
          os={OperatingSystem.LINUX}
          primaryControl={<span>{'Linux control'}</span>}
          data-test-subj="linuxRow"
        />
      </>
    );

    for (const row of ['windowsRow', 'macRow', 'linuxRow']) {
      expect(result.getByTestId(`${row}-osLabel`)).toHaveStyleRule('flex-basis', '5rem');
      expect(result.getByTestId(`${row}-osLabel`)).toHaveStyleRule('min-inline-size', '5rem');
    }
  });

  it('renders inlineControls beside the primary control and children below it', () => {
    const render = createAppRootMockRenderer();
    const result = render.render(
      <OsRow
        os={OperatingSystem.WINDOWS}
        primaryControl={<span>{'primary-control'}</span>}
        inlineControls={<span>{'inline-control'}</span>}
        data-test-subj={testSubj}
      >
        <span>{'panel-content'}</span>
      </OsRow>
    );

    const primary = result.getByText('primary-control');
    const inline = result.getByText('inline-control');
    const panel = result.getByText('panel-content');
    expect(primary.parentElement?.parentElement).toBe(inline.parentElement?.parentElement);
    expect(panel.parentElement).not.toBe(primary.parentElement?.parentElement);
  });

  it('renders labelAppend beside the OS name rather than in the control column', () => {
    const render = createAppRootMockRenderer();
    const result = render.render(
      <OsRow
        os={OperatingSystem.WINDOWS}
        primaryControl={<span>{'primary-control'}</span>}
        labelAppend={<span>{'label-notice'}</span>}
        data-test-subj={testSubj}
      />
    );

    const osLabel = result.getByText(OS_TITLES[OperatingSystem.WINDOWS]);
    const notice = result.getByText('label-notice');
    const primary = result.getByText('primary-control');

    // The notice shares the label column with the OS name, and is not in the control column.
    expect(result.getByTestId(`${testSubj}-osLabel`)).toContainElement(notice);
    expect(result.getByTestId(`${testSubj}-osLabel`)).toContainElement(osLabel);
    expect(result.getByTestId(`${testSubj}-osLabel`)).not.toContainElement(primary);
  });

  it('omits the label slot entirely when labelAppend is not given', () => {
    const render = createAppRootMockRenderer();
    const result = render.render(
      <OsRow
        os={OperatingSystem.MAC}
        primaryControl={<span>{'primary-control'}</span>}
        data-test-subj={testSubj}
      />
    );

    expect(result.getByTestId(`${testSubj}-osLabel`)).toHaveTextContent(
      OS_TITLES[OperatingSystem.MAC]
    );
    expect(result.queryByText('label-notice')).not.toBeInTheDocument();
  });

  it('renders a separator after a non-final row but not after the last row', () => {
    const render = createAppRootMockRenderer();
    const result = render.render(
      <>
        <OsRow
          os={OperatingSystem.WINDOWS}
          primaryControl={<span>{'Windows control'}</span>}
          data-test-subj="windowsRow"
        />
        <OsRow
          os={OperatingSystem.MAC}
          primaryControl={<span>{'Mac control'}</span>}
          isLast={true}
          data-test-subj="macRow"
        />
      </>
    );

    expect(result.getByTestId('windowsRow-separator')).toBeInTheDocument();
    expect(result.queryByTestId('macRow-separator')).not.toBeInTheDocument();
  });
});
