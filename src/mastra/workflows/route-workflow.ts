import { createNarration } from "../tools/elevenlabs-tool";
import { getEnvironmentalConditions } from "../tools/environment-tool";
import { findFootpaths, type Coordinates } from "../tools/osm-tool";
import { rankPathsWithGemma } from "../tools/gemma-tool";
import type { RoutePreferences } from "../tools/tabpfn-tool";
import { createConnectedRoute } from "../tools/routing-tool";

export async function planRoute(
  location: Coordinates,
  preferences: RoutePreferences,
) {
  const [osmCandidates, conditions] = await Promise.all([
    findFootpaths(location),
    getEnvironmentalConditions(location),
  ]);
  let candidates = osmCandidates;
  let routeSteps: Awaited<ReturnType<typeof createConnectedRoute>>["steps"] = [];

  if (process.env.OPENROUTESERVICE_API_KEY) {
    try {
      const connectedRoute = await createConnectedRoute(
        location,
        preferences.targetDistanceKm,
      );
      candidates = [
        {
          id: "connected-route",
          name: "Connected run route",
          surface: "mixed",
          lit: false,
          coordinates: connectedRoute.coordinates,
          distanceMeters: connectedRoute.distanceMeters,
          tags: {
            source: "openrouteservice",
            durationSeconds: String(Math.round(connectedRoute.durationSeconds)),
          },
        },
      ];
      routeSteps = connectedRoute.steps;
    } catch (error) {
      console.error("Connected route unavailable.", error);
      throw error;
    }
  }

  const rankedRoutes = await rankPathsWithGemma(candidates, preferences, conditions);
  const bestPath = rankedRoutes.paths[0];

  if (!bestPath) {
    throw new Error("No walkable route candidates were found near this location.");
  }

  const narration = await createNarration(bestPath);

  return {
    route: bestPath,
    alternatives: rankedRoutes.paths.slice(1, 3),
    narration,
    conditions,
    scoringSource: rankedRoutes.source,
    routeSteps,
    generatedAt: new Date().toISOString(),
  };
}
