export type DirectoryCompetitor = { name: string; url: string; source: 'craft' | 'owler' };

function decodeHtml(h: string) {
  return h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim();
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; COANTO/1.0)' } });
  if (!response.ok) return '';
  return decodeHtml(await response.text());
}

function namesFromDirectory(text: string, ownBrand: string) {
  const names: string[] = [];
  const patterns = [/competitors and similar companies include\s+([^\.]{20,260})/i, /top\s+\d*\s*competitors (?:are|include)\s+([^\.]{20,260})/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    for (const raw of match[1].split(/,|\band\b/i)) {
      const name = raw.replace(/\s+\(.*?\)/g, '').trim();
      if (name.length < 2 || name.length > 70 || name.toLowerCase().includes(ownBrand.toLowerCase())) continue;
      if (!names.some((item) => item.toLowerCase() === name.toLowerCase())) names.push(name);
    }
  }
  return names.slice(0, 8);
}

export async function discoverDirectoryNames(brand: string) {
  const slug = brand.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const sources: Array<{ url: string; source: 'craft' | 'owler' }> = [
    { url: `https://craft.co/${slug}/competitors`, source: 'craft' },
    { url: `https://www.owler.com/company/${slug}/competitors`, source: 'owler' },
  ];
  const out: DirectoryCompetitor[] = [];
  for (const source of sources) {
    try {
      const text = await fetchText(source.url);
      for (const name of namesFromDirectory(text, brand)) {
        if (!out.some((item) => item.name.toLowerCase() === name.toLowerCase())) out.push({ name, url: source.url, source: source.source });
      }
    } catch {
      // supplementary evidence only
    }
  }
  return out;
}
