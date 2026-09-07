// Indian Railways Stations Spatial Database & Live Reverse Geocoding

export type RailwayStation = {
  code: string;
  name: string;
  zone: string;
  division: string;
  lat: number;
  lon: number;
};

// Curated network of major railway stations and junctions across India
export const INDIAN_RAILWAY_STATIONS: RailwayStation[] = [
  // Eastern Railway (ER) & South Eastern (Kolkata Hub)
  { code: 'BNR', name: 'Bidhan Nagar Road', zone: 'Eastern Railway', division: 'Sealdah', lat: 22.5894, lon: 88.3970 },
  { code: 'KOAA', name: 'Kolkata Station (Chitpur)', zone: 'Eastern Railway', division: 'Sealdah', lat: 22.6033, lon: 88.3792 },
  { code: 'DDJ', name: 'Dum Dum Junction', zone: 'Eastern Railway', division: 'Sealdah', lat: 22.6225, lon: 88.3778 },
  { code: 'SDAH', name: 'Sealdah Junction', zone: 'Eastern Railway', division: 'Sealdah', lat: 22.5697, lon: 88.3712 },
  { code: 'HWH', name: 'Howrah Junction', zone: 'Eastern Railway', division: 'Howrah', lat: 22.5839, lon: 88.3426 },
  { code: 'SHM', name: 'Shalimar Terminal', zone: 'South Eastern Railway', division: 'Kharagpur', lat: 22.5532, lon: 88.3188 },
  { code: 'BDC', name: 'Bandel Junction', zone: 'Eastern Railway', division: 'Howrah', lat: 22.9238, lon: 88.3755 },
  { code: 'ASN', name: 'Asansol Junction', zone: 'Eastern Railway', division: 'Asansol', lat: 23.6871, lon: 86.9746 },

  // Northern Railway (NR - Delhi Hub)
  { code: 'NDLS', name: 'New Delhi Central', zone: 'Northern Railway', division: 'Delhi', lat: 28.6139, lon: 77.2090 },
  { code: 'DLI', name: 'Old Delhi Junction', zone: 'Northern Railway', division: 'Delhi', lat: 28.6562, lon: 77.2300 },
  { code: 'NZM', name: 'Hazrat Nizamuddin', zone: 'Northern Railway', division: 'Delhi', lat: 28.5888, lon: 77.2534 },
  { code: 'ANVT', name: 'Anand Vihar Terminal', zone: 'Northern Railway', division: 'Delhi', lat: 28.6469, lon: 77.3150 },
  { code: 'DEE', name: 'Delhi Sarai Rohilla', zone: 'Northern Railway', division: 'Delhi', lat: 28.6635, lon: 77.1856 },

  // Western & Central Railway (Mumbai Hub)
  { code: 'CSMT', name: 'Chhatrapati Shivaji Maharaj Terminus', zone: 'Central Railway', division: 'Mumbai CR', lat: 18.9402, lon: 72.8356 },
  { code: 'MMCT', name: 'Mumbai Central', zone: 'Western Railway', division: 'Mumbai WR', lat: 18.9696, lon: 72.8194 },
  { code: 'BDTS', name: 'Bandra Terminus', zone: 'Western Railway', division: 'Mumbai WR', lat: 19.0573, lon: 72.8427 },
  { code: 'LTT', name: 'Lokmanya Tilak Terminus', zone: 'Central Railway', division: 'Mumbai CR', lat: 19.0688, lon: 72.8897 },
  { code: 'PUNE', name: 'Pune Junction', zone: 'Central Railway', division: 'Pune', lat: 18.5289, lon: 73.8744 },

  // Southern Railway (SR)
  { code: 'MAS', name: 'Chennai Central (MGR)', zone: 'Southern Railway', division: 'Chennai', lat: 13.0827, lon: 80.2755 },
  { code: 'MS', name: 'Chennai Egmore', zone: 'Southern Railway', division: 'Chennai', lat: 13.0784, lon: 80.2612 },
  { code: 'SBC', name: 'KSR Bengaluru City', zone: 'South Western Railway', division: 'Bengaluru', lat: 12.9784, lon: 77.5694 },
  { code: 'YPR', name: 'Yesvantpur Junction', zone: 'South Western Railway', division: 'Bengaluru', lat: 13.0238, lon: 77.5503 },

  // South Central (Hyderabad Hub)
  { code: 'SC', name: 'Secunderabad Junction', zone: 'South Central Railway', division: 'Secunderabad', lat: 17.4334, lon: 78.5034 },
  { code: 'HYB', name: 'Hyderabad Deccan (Nampally)', zone: 'South Central Railway', division: 'Hyderabad', lat: 17.3924, lon: 78.4682 },

  // North Eastern / East Central (Patna, Lucknow, Varanasi, Guwahati)
  { code: 'LKO', name: 'Lucknow Charbagh', zone: 'Northern Railway', division: 'Lucknow', lat: 26.8322, lon: 80.9234 },
  { code: 'BSB', name: 'Varanasi Junction', zone: 'Northern Railway', division: 'Lucknow', lat: 25.3283, lon: 82.9868 },
  { code: 'PNBE', name: 'Patna Junction', zone: 'East Central Railway', division: 'Danapur', lat: 25.6038, lon: 85.1362 },
  { code: 'GHY', name: 'Guwahati Junction', zone: 'Northeast Frontier Railway', division: 'Lumding', lat: 26.1818, lon: 91.7514 },
];

// Haversine formula to compute distance in km
export function getHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type NearestStationResult = {
  code: string;
  name: string;
  zone: string;
  division: string;
  distanceKm: number;
  fullLabel: string;
};

// Find the closest Indian Railway station based on GPS coordinates
export function findNearestRailwayStation(lat: number, lon: number): NearestStationResult {
  let closest = INDIAN_RAILWAY_STATIONS[0];
  let minDistance = getHaversineKm(lat, lon, closest.lat, closest.lon);

  for (let i = 1; i < INDIAN_RAILWAY_STATIONS.length; i++) {
    const station = INDIAN_RAILWAY_STATIONS[i];
    const dist = getHaversineKm(lat, lon, station.lat, station.lon);
    if (dist < minDistance) {
      minDistance = dist;
      closest = station;
    }
  }

  const roundedDist = Number(minDistance.toFixed(1));
  const fullLabel = `${closest.name} (${closest.code}) • ${closest.zone}${
    roundedDist > 0.5 ? ` (${roundedDist} km)` : ''
  }`;

  return {
    code: closest.code,
    name: closest.name,
    zone: closest.zone,
    division: closest.division,
    distanceKm: roundedDist,
    fullLabel,
  };
}

// Reverse Geocode using OpenStreetMap Nominatim with caching
const geocodeCache: Record<string, string> = {};

export async function reverseGeocodeLocation(lat: number, lon: number): Promise<string> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (geocodeCache[key]) return geocodeCache[key];

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14`,
      { headers: { 'User-Agent': 'IR-Vikrant-Command-Center/2.0' } }
    );
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const suburb = addr.suburb || addr.neighbourhood || addr.city_district || addr.town || addr.village;
      const city = addr.city || addr.state_district || addr.state;
      const result = suburb && city ? `${suburb}, ${city}` : data.display_name?.split(',').slice(0, 2).join(',') || city;
      if (result) {
        geocodeCache[key] = result;
        return result;
      }
    }
  } catch (err) {
    // Silently fall back to station lookup
  }

  const nearest = findNearestRailwayStation(lat, lon);
  return nearest.fullLabel;
}
