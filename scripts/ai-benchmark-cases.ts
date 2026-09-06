export type BenchmarkCase = {
  id: string;
  brand: string;
  url: string;
  expectedCompetitors: string[];
};

export const BENCHMARK_CASES: BenchmarkCase[] = [
  { id: 'allbirds', brand: 'Allbirds', url: 'https://www.allbirds.com/', expectedCompetitors: ['adidas.com', 'rothys.com', 'reebok.com', 'clarks.com', 'greats.com'] },
  { id: 'adidas', brand: 'Adidas', url: 'https://www.adidas.com/', expectedCompetitors: ['nike.com', 'puma.com', 'underarmour.com', 'skechers.com', 'asics.com'] },
  { id: 'noon', brand: 'Noon', url: 'https://www.noon.com/uae-en/', expectedCompetitors: ['amazon.ae', 'trendyol.com', 'carrefouruae.com', 'namshi.com', 'ounass.ae'] },
  { id: 'nike', brand: 'Nike', url: 'https://www.nike.com/', expectedCompetitors: ['adidas.com', 'puma.com', 'underarmour.com', 'newbalance.com', 'asics.com'] },
  { id: 'shopify', brand: 'Shopify', url: 'https://www.shopify.com/', expectedCompetitors: ['wix.com', 'bigcommerce.com', 'squarespace.com', 'woocommerce.com', 'salesforce.com'] },
  { id: 'airbnb', brand: 'Airbnb', url: 'https://www.airbnb.com/', expectedCompetitors: ['booking.com', 'vrbo.com', 'expedia.com', 'tripadvisor.com', 'agoda.com'] },
  { id: 'booking', brand: 'Booking.com', url: 'https://www.booking.com/', expectedCompetitors: ['expedia.com', 'agoda.com', 'hotels.com', 'airbnb.com', 'trip.com'] },
  { id: 'uber', brand: 'Uber', url: 'https://www.uber.com/', expectedCompetitors: ['lyft.com', 'bolt.eu', 'grab.com', 'careem.com', 'doordash.com'] },
  { id: 'deliveroo', brand: 'Deliveroo', url: 'https://deliveroo.co.uk/', expectedCompetitors: ['just-eat.co.uk', 'ubereats.com', 'doordash.com', 'foodhub.com', 'deliveroo.com'] },
  { id: 'hm', brand: 'H&M', url: 'https://www2.hm.com/', expectedCompetitors: ['zara.com', 'uniqlo.com', 'gap.com', 'primark.com', 'mango.com'] },
  { id: 'zara', brand: 'Zara', url: 'https://www.zara.com/', expectedCompetitors: ['hm.com', 'uniqlo.com', 'mango.com', 'gap.com', 'primark.com'] },
  { id: 'sephora', brand: 'Sephora', url: 'https://www.sephora.com/', expectedCompetitors: ['ulta.com', 'macys.com', 'nordstrom.com', 'bluemercury.com', 'beautybay.com'] },
  { id: 'amazon', brand: 'Amazon', url: 'https://www.amazon.com/', expectedCompetitors: ['walmart.com', 'ebay.com', 'target.com', 'costco.com', 'etsy.com'] },
  { id: 'walmart', brand: 'Walmart', url: 'https://www.walmart.com/', expectedCompetitors: ['amazon.com', 'target.com', 'costco.com', 'ebay.com', 'kroger.com'] },
  { id: 'target', brand: 'Target', url: 'https://www.target.com/', expectedCompetitors: ['walmart.com', 'amazon.com', 'costco.com', 'kohls.com', 'macys.com'] },
  { id: 'etsy', brand: 'Etsy', url: 'https://www.etsy.com/', expectedCompetitors: ['ebay.com', 'amazon.com', 'wayfair.com', 'walmart.com', 'redbubble.com'] },
  { id: 'best-buy', brand: 'Best Buy', url: 'https://www.bestbuy.com/', expectedCompetitors: ['walmart.com', 'amazon.com', 'newegg.com', 'microcenter.com', 'costco.com'] },
  { id: 'wayfair', brand: 'Wayfair', url: 'https://www.wayfair.com/', expectedCompetitors: ['amazon.com', 'overstock.com', 'walmart.com', 'homedepot.com', 'ikea.com'] },
  { id: 'asos', brand: 'ASOS', url: 'https://www.asos.com/', expectedCompetitors: ['zara.com', 'hm.com', 'boohoo.com', 'next.co.uk', 'shein.com'] },
  { id: 'shein', brand: 'SHEIN', url: 'https://www.shein.com/', expectedCompetitors: ['temu.com', 'asos.com', 'zara.com', 'hm.com', 'fashionnova.com'] },
  { id: 'namshi', brand: 'Namshi', url: 'https://www.namshi.com/', expectedCompetitors: ['noon.com', 'amazon.ae', 'ounass.ae', '6thstreet.com', 'niceonesa.com'] },
  { id: 'ounass', brand: 'Ounass', url: 'https://www.ounass.ae/', expectedCompetitors: ['farfetch.com', 'net-a-porter.com', 'mytheresa.com', 'namshi.com', 'noon.com'] },
  { id: 'careem', brand: 'Careem', url: 'https://www.careem.com/', expectedCompetitors: ['uber.com', 'lyft.com', 'bolt.eu', 'grab.com', 'yango.com'] },
  { id: 'spotify', brand: 'Spotify', url: 'https://www.spotify.com/', expectedCompetitors: ['apple.com', 'youtube.com', 'amazon.com', 'soundcloud.com', 'tidal.com'] },
];
