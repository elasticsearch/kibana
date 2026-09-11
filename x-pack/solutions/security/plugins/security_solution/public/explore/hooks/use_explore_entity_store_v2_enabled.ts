/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useUiSetting } from '@kbn/kibana-react-plugin/public';
import { FF_ENABLE_ENTITY_STORE_V2 } from '@kbn/entity-store/public';
import { useIsEntityStoreV2Available } from '../../flyout/shared/hooks/use_is_entity_store_v2_available';

/**
 * Explore Hosts/Users v2 queries require both the UI setting and a live
 * entity-store latest index. Fall back to legacy while the index probe is in
 * flight so Lens does not flash field-not-found errors when the store is not
 * installed.
 */
export const useExploreEntityStoreV2Enabled = (): boolean => {
  const entityStoreV2SettingEnabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2) === true;
  const { data, isLoading } = useIsEntityStoreV2Available();

  if (!entityStoreV2SettingEnabled) {
    return false;
  }

  if (isLoading || data == null) {
    return false;
  }

  return data.indexExists === true;
};
