import { parseAnalyticsConfig } from './analytics';
declare const __DM_ANALYTICS__: unknown;
export const analyticsConfig = parseAnalyticsConfig(typeof __DM_ANALYTICS__ === 'undefined' ? null : __DM_ANALYTICS__);
