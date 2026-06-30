import type { IRouter } from '@kbn/core/server';
import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';
import type { ILicenseState } from '../../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../types';
export declare const healthRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState, encryptedSavedObjects: EncryptedSavedObjectsPluginSetup) => void;
