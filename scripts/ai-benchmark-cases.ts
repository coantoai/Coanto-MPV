export type BenchmarkCase = {
  id: string;
  brand: string;
  url: string;
  expectedCompetitors: string[];
};

export const BENCHMARK_CASES: BenchmarkCase[] = [
  { id: 'allbirds', brand: 'Allbirds', url: 'https://www.allbirds.com/', expectedCompetitors: ['adidas.com', 'rothy.com', 'reebok.com', 'clarks.com', 'greats.com'] },
  { id: 'adidas', brand: 'Adidas', url: 'https://www.adidas.com/', expectedCompetitors: ['nike.com', 'puma.com', 'underarmour.com', 'skechers.com', 'asics.com'] },
  { id: 'noon', brand: 'Noon', url: 'https://www.noon.com/uae-en/', expectedCompetitors: ['amazon.ae', 'trendyol.com', 'carrefouruae.com', 'namshi.com', 'ounass.ae'] },
  { id: 'nike', brand: 'Nike', url: 'https://www.nike.com/', expectedCompetitors: ['adidas.com', 'puma.com', 'underarmour.com', 'newbalance.com', 'asics.com'] },
  { id: 'shopify', brand: 'Shopify', url: 'https://www.shopify.com/', expectedCompetitors: ['wix.com', 'bigcommerce.com', 'squarespace.com', 'woocommerce.com', 'salesforce.com'] },
  { id: 'airbnb', brand: 'Airbnb', url: 'https://www.airbnb.com/', expectedCompetitors: ['booking.com', 'vrbo.com', 'expedia.com', 'tripadvisor.com', 'agoda.com'] },
  { id: 'booking', brand: 'Booking.com', url: 'https://www.booking.com/', expectedCompetitors: ['expedia.com', 'agoda.com', 'hotels.com', 'airbnb.com', 'trip.com'] },
  { id: 'uber', brand: 'Uber', url: 'https://www.uber.com/', expectedCompetitors: ['lyft.com', 'bolt.eu', 'grab.com', 'careem.com', 'doordash.com'] },
  { id: 'deliveroo', brand: 'Deliveroo', url: 'https://deliveroo.co.uk/', expectedCompetitors: ['just-eat.co.uk', 'ubereats.com', 'doordash.com', 'deliveroo.co.uk', 'foodhub.com'] },
  { id: 'hm', brand: 'H&M', url: 'https://www2.hm.com/', expectedCompetitors: ['zara.com', 'uniqlo.com', 'gap.com', 'primark.com', 'mango.com'] },
  { id: 'zara', brand: 'Zara', url: 'https://www.zara.com/', expectedCompetitors: ['hm.com', 'uniqlo.com', 'mango.com', 'gap.com', 'primark.com'] },
  { id: 'sephora', brand: 'Sephora', url: 'https://www.sephora.com/', expectedCompetitors: ['ulta.com', 'macys.com', 'nordstrom.com', 'ulta.com', 'bluemercury.com'] },
];
