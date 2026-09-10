import { createAdminClient } from '@insforge/sdk';
import { getServerConfig } from './config.server';

let cached: ReturnType<typeof createAdminClient>['database'] | undefined;

/** Primary COANTO database adapter. Server-only. */
export function getDatabase() {
  if (cached) return cached;
  const { insforge } = getServerConfig();
  cached = createAdminClient({ baseUrl: insforge.url, apiKey: insforge.apiKey }).database;
  return cached;
}
