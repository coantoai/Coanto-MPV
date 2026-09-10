import { fetchSite, type SiteSnapshot } from './analyze.server';
import { fetchSiteViaApify, getApifyRuntimeConfig } from './apify.server';

export type AcquisitionProvider = 'direct' | 'apify';
export type AcquiredSiteSnapshot = SiteSnapshot & { acquisitionProvider: AcquisitionProvider };

function fromDirect(snapshot: SiteSnapshot): AcquiredSiteSnapshot {
  return { ...snapshot, acquisitionProvider: 'direct' };
}

function fromApify(page: Awaited<ReturnType<typeof fetchSiteViaApify>>): AcquiredSiteSnapshot {
  return {
    url: page.url,
    title: page.title,
    description: page.description,
    h1: page.h1,
    h2: page.h2,
    text: page.text,
    sourceType: 'direct-site',
    evidence: [`direct-page-via-apify:${page.actorId}`, page.url],
    acquisitionProvider: 'apify',
  };
}

/**
 * Cost-aware acquisition boundary. Direct HTTP remains the default; Apify is
 * used only as configured fallback unless APIFY_MODE=preferred is explicitly set.
 */
export async function acquireSiteSnapshot(url: string): Promise<AcquiredSiteSnapshot> {
  const config = getApifyRuntimeConfig();
  if (config.configured && config.mode === 'preferred') {
    try { return fromApify(await fetchSiteViaApify(url)); } catch {
      return fromDirect(await fetchSite(url));
    }
  }

  try {
    return fromDirect(await fetchSite(url));
  } catch (directError) {
    if (!config.configured) throw directError;
    try { return fromApify(await fetchSiteViaApify(url)); } catch (apifyError) {
      const directMessage = directError instanceof Error ? directError.message : 'direct acquisition failed';
      const apifyMessage = apifyError instanceof Error ? apifyError.message : 'Apify acquisition failed';
      throw new Error(`Acquisition failed. Direct: ${directMessage.slice(0, 180)}; Apify: ${apifyMessage.slice(0, 180)}`);
    }
  }
}
