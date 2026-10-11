import type { Coordinates } from "./osm-tool";

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  type: number;
};

export type ConnectedRoute = {
  coordinates: Coordinates[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  source: "openrouteservice";
};

type OpenRouteServiceResponse = {
  features?: Array<{
    geometry?: { coordinates?: Array<[number, number]> };
    properties?: {
      summary?: { distance?: number; duration?: number };
      segments?: Array<{
        steps?: Array<{
          instruction?: string;
          distance?: number;
          duration?: number;
          type?: number;
        }>;
      }>;
    };
  }>;
};

const ORS_ENDPOINT =
  "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";

function offsetDestination(
  origin: Coordinates,
  routeDistanceMeters: number,
  bearingDegrees: number,
): Coordinates {
  const earthRadiusMeters = 6_371_000;
  const angularDistance = routeDistanceMeters / 2 / earthRadiusMeters;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitude = (origin.latitude * Math.PI) / 180;
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const destinationLongitude =
    (origin.longitude * Math.PI) / 180 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude),
    );

  return {
    latitude: (destinationLatitude * 180) / Math.PI,
    longitude: (destinationLongitude * 180) / Math.PI,
  };
}

async function requestRoute(
  origin: Coordinates,
  waypoint: Coordinates,
  apiKey: string,
): Promise<ConnectedRoute> {
  const response = await fetch(ORS_ENDPOINT, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      coordinates: [
        [origin.longitude, origin.latitude],
        [waypoint.longitude, waypoint.latitude],
        [origin.longitude, origin.latitude],
      ],
      instructions: true,
      instructions_format: "text",
      geometry: true,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`OpenRouteService failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as OpenRouteServiceResponse;
  const feature = data.features?.[0];
  const geometry = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;
  if (!geometry || !summary?.distance || !summary.duration) {
    throw new Error("OpenRouteService returned an incomplete route.");
  }

  const steps =
    feature.properties?.segments?.flatMap((segment) =>
      (segment.steps ?? []).map((step) => ({
        instruction: step.instruction || "Continue along the route.",
        distanceMeters: step.distance || 0,
        durationSeconds: step.duration || 0,
        type: step.type || 0,
      })),
    ) ?? [];

  return {
    coordinates: geometry.map(([longitude, latitude]) => ({ latitude, longitude })),
    distanceMeters: summary.distance,
    durationSeconds: summary.duration,
    steps,
    source: "openrouteservice",
  };
}

export async function createConnectedRoute(
  location: Coordinates,
  targetDistanceKm: number,
): Promise<ConnectedRoute> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTESERVICE_API_KEY is required for connected routing.");
  }

  const requestedMeters = targetDistanceKm * 1000;
  const bearings = [0, 90, 180, 270];
  const requestCandidates = (routeDistanceMeters: number) =>
    Promise.all(
      bearings.map((bearing) =>
        requestRoute(
          location,
          offsetDestination(location, routeDistanceMeters, bearing),
          apiKey,
        ),
      ),
    );

  let candidates = await requestCandidates(requestedMeters);
  let best = candidates.sort(
    (left, right) =>
      Math.abs(left.distanceMeters - requestedMeters) -
      Math.abs(right.distanceMeters - requestedMeters),
  )[0];

  // Routing networks can add significant detours. Use the first result to
  // adjust the waypoint distance, then choose the closest directional route.
  if (Math.abs(best.distanceMeters - requestedMeters) / requestedMeters > 0.1) {
    const adjustedDistance = requestedMeters * requestedMeters / best.distanceMeters;
    candidates = await requestCandidates(adjustedDistance);
    best = candidates.sort(
      (left, right) =>
        Math.abs(left.distanceMeters - requestedMeters) -
        Math.abs(right.distanceMeters - requestedMeters),
    )[0];
  }

  const errorRatio = Math.abs(best.distanceMeters - requestedMeters) / requestedMeters;
  if (errorRatio > 0.2) {
    throw new Error(
      `Could not create a route within 20% of ${targetDistanceKm} km. Closest route was ${(best.distanceMeters / 1000).toFixed(1)} km.`,
    );
  }

  return best;
}
