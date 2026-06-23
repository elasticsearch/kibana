/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useSelectedLocation } from '../../monitor_details/hooks/use_selected_location';
import { useTestRunDetailsBreadcrumbs } from '../../test_run_details/hooks/use_test_run_details_breadcrumbs';
import { useSelectedMonitor } from '../../monitor_details/hooks/use_selected_monitor';
import { useGetUrlParams } from '../../../hooks';
import { ConfigKey } from '../../../../../../common/runtime_types';
import { PLUGIN } from '../../../../../../common/constants/plugin';
import { useUrlSpaceId } from '../../../hooks/use_url_space_id';
import { buildMonitorParamsSearch } from '../../../utils/url_params';

export const useErrorDetailsBreadcrumbs = (
  extraCrumbs?: Array<{ text: string; href?: string }>
) => {
  const kibana = useKibana();
  const appPath = kibana.services.application?.getUrlForApp(PLUGIN.SYNTHETICS_PLUGIN_ID) ?? '';

  const { monitor } = useSelectedMonitor();

  const selectedLocation = useSelectedLocation();
  const spaceId = useUrlSpaceId();
  // Carry `remoteName` so the errors crumb stays on the remote (CCS) cluster
  // path; otherwise the local errors page 404s against missing saved objects.
  const { remoteName } = useGetUrlParams();

  const errorsSearch = buildMonitorParamsSearch({
    locationId: selectedLocation?.id,
    spaceId,
    remoteName,
  });

  const errorsBreadcrumbs = [
    {
      text: ERRORS_CRUMB,
      href: `${appPath}/monitor/${monitor?.[ConfigKey.CONFIG_ID]}/errors${errorsSearch}`,
    },
    ...(extraCrumbs ?? []),
  ];

  useTestRunDetailsBreadcrumbs(errorsBreadcrumbs);
};

const ERRORS_CRUMB = i18n.translate('xpack.synthetics.monitorsPage.errors', {
  defaultMessage: 'Errors',
});
