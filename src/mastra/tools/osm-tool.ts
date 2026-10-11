export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type PathCandidate = {
  id: string;
  name: string;
  surface: string;
  lit: boolean;
  coordinates: Coordinates[];
  tags: Record<string, string>;
  distanceMeters: number;
};

type OverpassElement = {
  id: number;
  type: "way";
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
};

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

function distanceBetween(first: Coordinates, second: Coordinates): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = ((second.latitude - first.latitude) * Math.PI) / 180;
  const longitudeDelta = ((second.longitude - first.longitude) * Math.PI) / 180;
  const latitude = (first.latitude + second.latitude) / 2 * (Math.PI / 180);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude) * Math.cos(latitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculatePathDistance(coordinates: Coordinates[]): number {
  return coordinates.slice(1).reduce(
    (total, coordinate, index) => total + distanceBetween(coordinates[index], coordinate),
    0,
  );
}

function fallbackPaths(location: Coordinates): PathCandidate[] {
  const offsets = [
    { latitude: 0.0022, longitude: 0.0004 },
    { latitude: -0.0015, longitude: 0.0019 },
    { latitude: 0.0005, longitude: -0.0024 },
  ];

  return offsets.map((offset, index) => {
    const coordinates = [
      location,
      {
        latitude: location.latitude + offset.latitude / 2,
        longitude: location.longitude + offset.longitude / 2,
      },
      {
        latitude: location.latitude + offset.latitude,
        longitude: location.longitude + offset.longitude,
      },
    ];
    return {
      id: `fallback-${index}`,
      name: `Local greenway ${index + 1}`,
      surface: "unknown",
      lit: index === 0,
      coordinates,
      distanceMeters: calculatePathDistance(coordinates),
      tags: { source: "fallback" },
    };
  });
}

export async function findFootpaths(
  location: Coordinates,
): Promise<PathCandidate[]> {
  const query = `
    [out:json][timeout:12];
    (
      way(around:1800,${location.latitude},${location.longitude})
        ["highway"~"footway|path|pedestrian|track|cycleway"];
    );
    out tags geom 20;
  `;

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Touch-Grass/0.1 (open-source route planner)",
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`OpenStreetMap returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as { elements?: OverpassElement[] };
    const paths = (data.elements ?? [])
      .filter((element) => element.geometry && element.geometry.length >= 2)
      .slice(0, 20)
      .map((element) => {
        const tags = element.tags ?? {};
        const coordinates = element.geometry!.map((point) => ({
          latitude: point.lat,
          longitude: point.lon,
        }));
        return {
          id: String(element.id),
          name: tags.name || "Unnamed footpath",
          surface: tags.surface || "unknown",
          lit: tags.lit === "yes",
          coordinates,
          distanceMeters: calculatePathDistance(coordinates),
          tags,
        };
      });

    return paths.length > 0 ? paths : fallbackPaths(location);
  } catch (error) {
    console.warn("OpenStreetMap lookup failed; using local route candidates.", error);
    return fallbackPaths(location);
  }
}