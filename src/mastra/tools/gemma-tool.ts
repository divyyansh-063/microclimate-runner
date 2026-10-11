import type { EnvironmentalConditions } from "./environment-tool";
import type { PathCandidate } from "./osm-tool";
import {
  scorePaths,
  type RoutePreferences,
  type ScoredPath,
} from "./tabpfn-tool";

type GemmaResponse = {
  response?: string;
};

type GemmaRouteScore = {
  id: string;
  score: number;
  reason: string;
};

export type RankedRoutes = {
  paths: ScoredPath[];
  source: "gemma-local" | "heuristic-fallback";
};

const OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/generate";

function buildPrompt(
  paths: PathCandidate[],
  preferences: RoutePreferences,
  conditions: EnvironmentalConditions,
): string {
  const routeData = paths.map((path) => ({
    id: path.id,
    name: path.name,
    surface: path.surface,
    lit: path.lit,
    distanceKm: Number((path.distanceMeters / 1000).toFixed(2)),
    tags: path.tags,
  }));

  return [
    "You are Gemma, a local route-planning assistant for runners.",
    "Rank the candidate paths for comfort, shade, lower pollen exposure, and the runner's preferences.",
    "Use only the supplied data. Do not invent weather, route geometry, or safety facts.",
    "Return JSON only: {\"routes\":[{\"id\":\"...\",\"score\":0,\"reason\":\"...\"}]}",
    "Scores must be integers from 0 to 100. Include every candidate exactly once.",
    `Runner preferences: ${JSON.stringify(preferences)}`,
    `Current conditions: ${JSON.stringify(conditions)}`,
    `Candidate paths: ${JSON.stringify(routeData)}`,
  ].join("\n");
}

function parseModelResponse(text: string, validIds: Set<string>): GemmaRouteScore[] {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error("Gemma did not return a JSON object.");
  }

  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
    routes?: unknown;
  };
  if (!Array.isArray(parsed.routes)) {
    throw new Error("Gemma response did not include a routes array.");
  }

  const scores = parsed.routes
    .map((entry): GemmaRouteScore | null => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Record<string, unknown>;
      if (
        typeof candidate.id !== "string" ||
        !validIds.has(candidate.id) ||
        typeof candidate.score !== "number" ||
        typeof candidate.reason !== "string"
      ) {
        return null;
      }
      return {
        id: candidate.id,
        score: Math.max(0, Math.min(100, Math.round(candidate.score))),
        reason: candidate.reason.slice(0, 180),
      };
    })
    .filter((entry): entry is GemmaRouteScore => entry !== null);

  if (scores.length !== validIds.size || new Set(scores.map((entry) => entry.id)).size !== validIds.size) {
    throw new Error("Gemma response did not score every route exactly once.");
  }
  return scores;
}

export async function rankPathsWithGemma(
  paths: PathCandidate[],
  preferences: RoutePreferences,
  conditions: EnvironmentalConditions,
): Promise<RankedRoutes> {
  const heuristicPaths = scorePaths(paths, preferences, conditions);
  const model = process.env.OLLAMA_GEMMA_MODEL || "gemma3:4b";

  try {
    const response = await fetch(OLLAMA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: buildPrompt(paths, preferences, conditions),
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}.`);
    }

    const data = (await response.json()) as GemmaResponse;
    const scores = parseModelResponse(data.response ?? "", new Set(paths.map((path) => path.id)));
    const scoreById = new Map(scores.map((score) => [score.id, score]));

    return {
      paths: heuristicPaths
        .map((path) => {
          const modelScore = scoreById.get(path.id);
          return {
            ...path,
            comfortScore: modelScore?.score ?? path.comfortScore,
            modelReason: modelScore?.reason,
          };
        })
        .sort((left, right) => right.comfortScore - left.comfortScore),
      source: "gemma-local",
    };
  } catch (error) {
    console.warn("Local Gemma ranking unavailable; using heuristic ranking.", error);
    return { paths: heuristicPaths, source: "heuristic-fallback" };
  }
}
