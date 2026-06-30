/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiCallOut,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
} from '@elastic/eui';
import type { FC } from 'react';
import React, { useEffect, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { createDstEvents, generateTimeZones } from '../../dst_utils';

interface Props {
  addEvents: (events: estypes.MlCalendarEvent[]) => void;
  setTimezone: (timezone: string) => void;
  isDisabled?: boolean;
}

export const DstEventGenerator: FC<Props> = ({ addEvents, setTimezone, isDisabled }) => {
  const [selectedTimeZones, setSelectedTimeZones] = useState<
    Array<EuiComboBoxOptionOption<string>>
  >([]);
  const [eventsCount, setEventsCount] = useState<number | null>(null);

  useEffect(() => {
    if (selectedTimeZones.length > 0) {
      setTimezone(selectedTimeZones[0].value!);
      const events = createDstEvents(selectedTimeZones[0].value!);
      addEvents(events);
      setEventsCount(events.length);
    } else {
      addEvents([]);
      setEventsCount(null);
    }
  }, [addEvents, selectedTimeZones, setTimezone]);

  const timeZoneOptions = useMemo(() => {
    return generateTimeZones().map((tz) => {
      return {
        label: tz,
        value: tz,
      };
    });
  }, []);

  return (
    <>
      <EuiFormRow
        fullWidth
        label={i18n.translate('xpack.ml.calendarsEdit.calendarForm.dstEventsAriaLabel', {
          defaultMessage: 'Time zone',
        })}
        helpText={
          <FormattedMessage
            id="xpack.ml.calendarsEdit.calendarForm.dstEventsHelpText"
            defaultMessage="The selected time zone should match the time zone of the data."
          />
        }
      >
        <EuiFlexGroup wrap gutterSize="s">
          <EuiFlexItem grow={false} css={{ width: '400px' }}>
            <EuiComboBox
              placeholder="Select time zone"
              singleSelection={{ asPlainText: true }}
              options={timeZoneOptions}
              selectedOptions={selectedTimeZones}
              onChange={setSelectedTimeZones}
              isDisabled={isDisabled === true}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFormRow>

      {eventsCount === 0 ? (
        <>
          <EuiSpacer size="s" />

          <EuiCallOut
            announceOnMount
            color="primary"
            iconType="info"
            size="s"
            title={
              <FormattedMessage
                id="xpack.ml.calendarsEdit.calendarForm.dstEventGenerator.noTimeZonesAvailableTitle"
                defaultMessage="No DST events available"
              />
            }
          >
            <div>
              <FormattedMessage
                id="xpack.ml.calendarsEdit.calendarForm.dstEventGenerator.noTimeZonesAvailableDescription"
                defaultMessage="Some time zones do not observe daylight saving time."
              />
            </div>
          </EuiCallOut>
        </>
      ) : null}
    </>
  );
};
