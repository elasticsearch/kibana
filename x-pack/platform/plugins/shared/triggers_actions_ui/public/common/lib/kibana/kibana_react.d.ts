import type { KibanaReactContextValue } from '@kbn/kibana-react-plugin/public';
import { KibanaContextProvider, useUiSetting, useUiSetting$, withKibana } from '@kbn/kibana-react-plugin/public';
import type { TriggersAndActionsUiServices } from '../../../application/rules_app';
export type KibanaContext = KibanaReactContextValue<TriggersAndActionsUiServices>;
export interface WithKibanaProps {
    kibana: KibanaContext;
}
declare const useTypedKibana: () => KibanaReactContextValue<Partial<import("@kbn/core/public").CoreStart> & TriggersAndActionsUiServices>;
export { KibanaContextProvider, useTypedKibana as useKibana, useUiSetting, useUiSetting$, withKibana, };
