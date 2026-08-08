/**
 * URL helpers used across the project.
 */

 export function detectBaseUrl(fileContent) {
   // Only consider URLs that have an API‑like path (e.g., /v1/, /api/)
   const patterns = [
     /(?:const|let|var)\s+API_BASE\s*=\s*["']([^"']+["'])/,
     /(?:const|let|var)\s+BASE_URL\s*=\s*["']([^"']+["'])/,
     /(?:const|let|var)\s+apiBase\s*=\s*["']([^"']+["'])/,
     // Only match URLs that contain a path segment starting with /v or /api
     /["'](https?:\/\/[^"']*\/(?:v\d+|api)\/[^"']*)["']/i,
   ];
   for (const regex of patterns) {
     const match = fileContent.match(regex);
     if (match) return match[1].replace(/\/+$/, '');
   }
   return null;
 }

 export function resolveUrl(url, baseUrl, baseUrls = []) {
   if (!url || url.startsWith('http')) return url;
   if (baseUrl && url.startsWith('/')) {
     return `${baseUrl}${url}`;
   }
   if (!baseUrl && baseUrls.length > 0 && url.startsWith('/')) {
     for (const candidate of baseUrls) {
       if (candidate) return `${candidate}${url}`;
     }
   }
   return url;
 }
