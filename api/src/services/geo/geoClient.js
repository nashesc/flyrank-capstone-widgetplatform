import { resolveMockGeo } from './geoMock.js';

const GEO_CACHE_TTL_MS = 5 * 60 * 1000;
const geoCacheByIp = new Map();

function isLocalOrPrivateIp(visitorIp) {
   if (!visitorIp) return true;
   return visitorIp === '::1' || visitorIp === '::ffff:127.0.0.1' ||
      visitorIp.startsWith('127.') || visitorIp.startsWith('10.') ||
      visitorIp.startsWith('192.168.') || visitorIp.startsWith('172.');
}

async function tryGeoProviderWithTimeout(providerUrl, timeoutMs) {
   const timeoutController = new AbortController();
   const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);
   try {
      const providerResponse = await fetch(providerUrl, { signal: timeoutController.signal });
      if (!providerResponse.ok) return null;
      return await providerResponse.json();
   } catch {
      return null;
   } finally {
      clearTimeout(timeoutHandle);
   }
}

export async function resolveGeoForIp(visitorIp) {
   if (process.env.GEO_MOCK === 'true') return resolveMockGeo();
   if (isLocalOrPrivateIp(visitorIp)) {
      return { geoCountry: null, geoCity: null, geoProviderUsed: null };
   }
   const cachedGeo = geoCacheByIp.get(visitorIp);
   if (cachedGeo && cachedGeo.expiresAt > Date.now()) return cachedGeo.geoResult;

   let geoResult = null;
   const primaryResponse = await tryGeoProviderWithTimeout(`http://ip-api.com/json/${visitorIp}?fields=status,country,city`, 1500);
   if (primaryResponse?.status === 'success') {
      geoResult = { geoCountry: primaryResponse.country ?? null, geoCity: primaryResponse.city ?? null, geoProviderUsed: 'ip-api.com' };
   } else {
      const fallbackResponse = await tryGeoProviderWithTimeout(`https://ipapi.co/${visitorIp}/json/`, 1500);
      if (fallbackResponse?.country_name || fallbackResponse?.city) {
         geoResult = { geoCountry: fallbackResponse.country_name ?? null, geoCity: fallbackResponse.city ?? null, geoProviderUsed: 'ipapi.co' };
      }
   }
   const finalGeo = geoResult ?? { geoCountry: null, geoCity: null, geoProviderUsed: null };
   geoCacheByIp.set(visitorIp, { geoResult: finalGeo, expiresAt: Date.now() + GEO_CACHE_TTL_MS });
   return finalGeo;
}