import type { Coordinates } from "./osm-tool";

export type EnvironmentalConditions = {
  temperatureC: number;
  windSpeedKph: number;
  windDirectionDegrees: number;
  uvIndex: number;
  pollenIndex: number | null;
  source: "open-meteo" | "fallback";
};

type WeatherResponse = {
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    uv_index?: number;
  };
};

type AirQualityResponse = {
  hourly?: {
    grass_pollen?: number[];
    birch_pollen?: number[];
    ragweed_pollen?: number[];
  };
};

export async function getEnvironmentalConditions(
  location: Coordinates,
): Promise<EnvironmentalConditions> {
  try {
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "temperature_2m,wind_speed_10m,wind_direction_10m,uv_index",
      timezone: "auto",
    }).toString();

    const pollenUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    pollenUrl.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      hourly: "grass_pollen,birch_pollen,ragweed_pollen",
      forecast_days: "1",
      timezone: "auto",
    }).toString();

    const [weatherResponse, pollenResponse] = await Promise.all([
      fetch(weatherUrl, { signal: AbortSignal.timeout(8_000) }),
      fetch(pollenUrl, { signal: AbortSignal.timeout(8_000) }),
    ]);

    if (!weatherResponse.ok || !pollenResponse.ok) {
      throw new Error("Open-Meteo returned an unsuccessful response.");
    }

    const weather = (await weatherResponse.json()) as WeatherResponse;
    const pollen = (await pollenResponse.json()) as AirQualityResponse;
    const current = weather.current;
    const pollenValues = [
      pollen.hourly?.grass_pollen?.[0],
      pollen.hourly?.birch_pollen?.[0],
      pollen.hourly?.ragweed_pollen?.[0],
    ].filter((value): value is number => typeof value === "number");

    if (!current || typeof current.temperature_2m !== "number") {
      throw new Error("Open-Meteo response did not contain current conditions.");
    }

    return {
      temperatureC: current.temperature_2m,
      windSpeedKph: current.wind_speed_10m ?? 0,
      windDirectionDegrees: current.wind_direction_10m ?? 0,
      uvIndex: current.uv_index ?? 0,
      pollenIndex: pollenValues.length > 0 ? Math.min(100, Math.round(Math.max(...pollenValues))) : null,
      source: "open-meteo",
    };
  } catch (error) {
    console.warn("Live environmental lookup failed; using neutral conditions.", error);
    return {
      temperatureC: 18,
      windSpeedKph: 8,
      windDirectionDegrees: 0,
      uvIndex: 3,
      pollenIndex: null,
      source: "fallback",
    };
  }
}
