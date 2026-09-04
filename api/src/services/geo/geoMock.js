export function resolveMockGeo() {
   const isProviderADown = process.env.GEO_MOCK_A_DOWN === 'true';
   const isProviderBDown = process.env.GEO_MOCK_B_DOWN === 'true';
   if (!isProviderADown) {
      return { geoCountry: 'Mockland-A', geoCity: 'Mock City A', geoProviderUsed: 'mock-a' };
   }
   if (!isProviderBDown) {
      return { geoCountry: 'Mockland-B', geoCity: 'Mock City B', geoProviderUsed: 'mock-b' };
   }
   return { geoCountry: null, geoCity: null, geoProviderUsed: null };
}