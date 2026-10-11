import type { PathCandidate } from "./osm-tool";
import type { EnvironmentalConditions } from "./environment-tool";

export type RoutePreferences = {
  targetDistanceKm: number;
  priority: "shade" | "pollen" | "balanced";
  surface: "any" | "paved" | "trail";
};

export type ScoredPath = PathCandidate & {
  shadeScore: number;
  pollenScore: number;
  comfortScore: number;
  estimatedMinutes: number;
  modelReason?: string;
};

function hash(value: string): number {
  return [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
}

export function scorePaths(
  paths: PathCandidate[],
  preferences: RoutePreferences,
  conditions: EnvironmentalConditions,
): ScoredPath[] {
  return paths
    .map((path) => {
      const tags = path.tags;
      const hasTrees = tags.natural === "tree_row" || tags.landuse === "forest";
      const shadeScore = Math.min(
        96,
        48 + (hasTrees ? 28 : 0) + (path.surface === "unpaved" ? 8 : 0) + (hash(path.id) % 16),
      );
      const livePollenPenalty = conditions.pollenIndex === null ? 0 : Math.min(35, conditions.pollenIndex * 0.35);
      const pollenScore = Math.max(
        18,
        84 - livePollenPenalty - (tags.landuse === "meadow" ? 30 : 0) - (tags.natural === "scrub" ? 18 : 0) - (hash(path.name) % 16),
      );
      const heatShadeBonus = conditions.temperatureC >= 25 || conditions.uvIndex >= 6 ? 8 : 0;
      const priorityScore =
        preferences.priority === "shade"
          ? (shadeScore + heatShadeBonus) * 0.7 + pollenScore * 0.3
          : preferences.priority === "pollen"
            ? (shadeScore + heatShadeBonus) * 0.3 + pollenScore * 0.7
            : (shadeScore + heatShadeBonus) * 0.45 + pollenScore * 0.55;
      const surfaceBonus =
        preferences.surface === "any" ||
        (preferences.surface === "paved" && ["asphalt", "paved", "concrete"].includes(path.surface)) ||
        (preferences.surface === "trail" && ["dirt", "ground", "unpaved", "fine_gravel"].includes(path.surface))
          ? 8
          : -12;
      const distanceFit = Math.max(
        0,
        20 - Math.abs(path.distanceMeters / 1000 - preferences.targetDistanceKm) * 4,
      );
      const comfortScore = Math.round(priorityScore + surfaceBonus + distanceFit);
      const estimatedMinutes = Math.max(1, Math.round((path.distanceMeters / 1000) * 6));

      return { ...path, shadeScore, pollenScore, comfortScore, estimatedMinutes };
    })
    .sort((left, right) => right.comfortScore - left.comfortScore);
}