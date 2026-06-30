import type { CoreSetup } from '@kbn/core/server';
import type { ProvisioningRunContext } from '../types';
import type { AlertingPluginsStart } from '../../plugin';
export declare const createProvisioningRunContext: (core: CoreSetup<AlertingPluginsStart>) => Promise<ProvisioningRunContext>;
