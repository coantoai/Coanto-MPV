import { discoverRelevantTrends } from '../src/lib/trends-pulse.server';

async function main() {
  const result = await discoverRelevantTrends({
    businessName: 'COANTO Live Test',
    productName: 'عطر عربي فاخر',
    productDescription: 'متجر صغير يبيع عطورًا عربية أونلاين ويعتمد على السوشيال ميديا للوصول للعملاء.',
    audience: 'عملاء في السعودية مهتمون بالعطور والهدايا',
    region: 'السعودية',
    city: 'الرياض',
    dialect: 'سعودي',
    tone: 'ودّي وواضح',
    objective: 'بيع',
    platforms: ['TikTok', 'Instagram Reels', 'YouTube', 'X', 'Google/Web'],
  });

  if (!result.generatedAt) throw new Error('Missing generatedAt');
  if (!Array.isArray(result.trends) || result.trends.length < 1) throw new Error('No live signals returned');
  if (!Array.isArray(result.sources) || result.sources.length < 1) throw new Error('No grounded web sources returned');
  if (!Array.isArray(result.searchQueries) || result.searchQueries.length < 1) throw new Error('No Google Search grounding queries returned');

  console.log('COANTO_PULSE_LIVE_OK');
  console.log(`signals=${result.trends.length}`);
  console.log(`sources=${result.sources.length}`);
  console.log(`queries=${result.searchQueries.length}`);
  console.log(`first_signal=${result.trends[0]?.title || 'none'}`);
}

main().catch((error) => {
  console.error('COANTO_PULSE_LIVE_FAILED');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
