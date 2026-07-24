// Utilitas geospasial murni (tanpa dependensi eksternal)

/**
 * Cek apakah titik (lat, lng) berada di dalam polygon.
 * polygon: array [{ lat, lng }, ...] minimal 3 titik.
 * Algoritma: ray-casting (PNPOLY).
 */
export function isPointInPolygon(lat, lng, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const lati = polygon[i].lat;
    const lngi = polygon[i].lng;
    const latj = polygon[j].lat;
    const lngj = polygon[j].lng;
    const intersect =
      lngi > lng !== lngj > lng &&
      lat < ((latj - lati) * (lng - lngi)) / (lngj - lngi) + lati;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Jarak antara dua koordinat dalam meter (rumus haversine).
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // radius bumi (meter)
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
