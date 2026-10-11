"use client";

import { useEffect, useMemo, useState } from "react";

type Coordinate = { latitude: number; longitude: number };
type RouteStep = { instruction: string; distanceMeters: number };
type PlannerResult = {
  route: {
    name: string;
    surface: string;
    shadeScore: number;
    pollenScore: number;
    distanceMeters: number;
    estimatedMinutes: number;
    coordinates: Coordinate[];
  };
  routeSteps: RouteStep[];
  narration: { text: string; audioDataUri?: string };
  conditions: { temperatureC: number; uvIndex: number; pollenIndex: number | null; source: string };
  scoringSource: "gemma-local" | "heuristic-fallback";
};

function RoutePreview({ coordinates }: { coordinates: Coordinate[] }) {
  const path = useMemo(() => {
    if (coordinates.length < 2) return "";
    const longitudes = coordinates.map((point) => point.longitude);
    const latitudes = coordinates.map((point) => point.latitude);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const longitudeRange = maxLongitude - minLongitude || 1;
    const latitudeRange = maxLatitude - minLatitude || 1;
    return coordinates
      .map((point, index) => {
        const x = 20 + ((point.longitude - minLongitude) / longitudeRange) * 360;
        const y = 20 + (1 - (point.latitude - minLatitude) / latitudeRange) * 180;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [coordinates]);

  return (
    <div className="route-preview" aria-label="Route preview">
      <svg viewBox="0 0 400 220" role="img">
        <path className="route-grid" d="M20 60H380M20 110H380M20 160H380M100 20V200M200 20V200M300 20V200" />
        {path && <path className="route-line" d={path} />}
        <circle className="route-start" cx="20" cy="20" r="7" />
      </svg>
      <span className="map-label">Start / finish</span>
    </div>
  );
}

function distanceBetween(first: Coordinate, second: Coordinate): number {
  const latitudeDelta = ((second.latitude - first.latitude) * Math.PI) / 180;
  const longitudeDelta = ((second.longitude - first.longitude) * Math.PI) / 180;
  const latitude = (first.latitude + second.latitude) * Math.PI / 360;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude) * Math.cos(latitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Home() {
  const [result, setResult] = useState<PlannerResult | null>(null);
  const [status, setStatus] = useState("Ready when you are.");
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [trackedMeters, setTrackedMeters] = useState(0);
  const [targetDistanceKm, setTargetDistanceKm] = useState(5);
  const [priority, setPriority] = useState<"shade" | "pollen" | "balanced">("balanced");

  useEffect(() => {
    if (!isRunning || !navigator.geolocation) return;
    let previous: Coordinate | null = null;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        if (previous) {
          const delta = distanceBetween(previous, current);
          if (delta > 2 && delta < 200) setTrackedMeters((value) => value + delta);
        }
        previous = current;
      },
      () => setStatus("Live GPS updates are unavailable; follow the audio briefing."),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isRunning]);

  function planFromLocation(position: GeolocationPosition) {
    setIsLoading(true);
    setStatus("Reading your surroundings...");
    fetch("/api/route-planner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        targetDistanceKm,
        priority,
        surface: "any",
      }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not plan your route.");
        return data as PlannerResult;
      })
      .then((data) => {
        setResult(data);
        setStatus("Route ready. Review the briefing, then start your run.");
      })
      .catch((error: unknown) => {
        setResult(null);
        setStatus(error instanceof Error ? error.message : "Could not plan your route.");
      })
      .finally(() => setIsLoading(false));
  }

  function getRoute() {
    if (!navigator.geolocation) {
      setStatus("Location is not available in this browser.");
      return;
    }
    setStatus("Finding your location...");
    navigator.geolocation.getCurrentPosition(
      planFromLocation,
      () => setStatus("Location permission is needed to find a nearby route."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  if (isRunning && result) {
    return (
      <main className="run-mode">
        <span className="live-pill"><span /> run mode</span>
        <p className="eyebrow">You are outside now</p>
        <h1>Keep moving.</h1>
        <div className="run-ring"><strong>{(trackedMeters / 1000).toFixed(2)}</strong><span>km completed</span></div>
        <p className="run-target">of {(result.route.distanceMeters / 1000).toFixed(1)} km planned</p>
        <p className="run-instruction">{result.routeSteps[0]?.instruction || result.narration.text}</p>
        {result.narration.audioDataUri && <audio controls autoPlay src={result.narration.audioDataUri} />}
        <button className="end-run" onClick={() => setIsRunning(false)}>End run</button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="runner-mark">↗</span> microclimate runner</div>
        <span className="live-pill"><span /> live conditions</span>
      </header>
      <section className="hero">
        <p className="eyebrow">Your next run, tuned to the air</p>
        <h1>Run with the<br /><em>weather on your side.</em></h1>
        <p className="intro">A calmer way to choose your route. We look for footpaths with more shade, lower pollen, and fewer reasons to turn back.</p>
        <div className="run-options" aria-label="Run preferences">
          <label>Distance<select value={targetDistanceKm} onChange={(event) => setTargetDistanceKm(Number(event.target.value))}><option value={3}>3 km</option><option value={5}>5 km</option><option value={10}>10 km</option></select></label>
          <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="balanced">Balanced</option><option value="shade">More shade</option><option value="pollen">Lower pollen</option></select></label>
        </div>
        <button className="route-button" onClick={getRoute} disabled={isLoading}><span className="button-icon">♧</span>{isLoading ? "Finding your run..." : "Plan my run"} <span>→</span></button>
        <p className="status" aria-live="polite">{status}</p>
      </section>
      {!result && <section className="run-brief"><div><span className="brief-icon">◎</span><strong>Start line</strong><span>Uses your current location</span></div><div><span className="brief-icon">◒</span><strong>Run conditions</strong><span>Shade + pollen aware</span></div><div><span className="brief-icon">◌</span><strong>Headphones ready</strong><span>Short audio briefing</span></div></section>}
      {result && (
        <section className="result-card">
          <div className="result-top"><div><p className="eyebrow">Best route for right now</p><h2>{result.route.name}</h2></div><span className="ready-dot">● run ready</span></div>
          <RoutePreview coordinates={result.route.coordinates} />
          <div className="metrics"><div><strong>{(result.route.distanceMeters / 1000).toFixed(1)} km</strong><span>route distance</span></div><div><strong>{result.route.estimatedMinutes} min</strong><span>estimated time</span></div><div><strong>{result.route.shadeScore}%</strong><span>shade score</span></div></div>
          <div className="condition-line"><span>{result.route.pollenScore}% low pollen</span><span>{result.route.surface} surface</span><span>{Math.round(result.conditions.temperatureC)}°C · UV {result.conditions.uvIndex.toFixed(0)}</span></div>
          <p className="model-source">{result.scoringSource === "gemma-local" ? "Ranked privately by local Gemma" : "Gemma unavailable · heuristic ranking used"}</p>
          {result.routeSteps.length > 0 && <div className="instructions"><p className="eyebrow">First route instructions</p>{result.routeSteps.slice(0, 4).map((step, index) => <div className="instruction" key={`${step.instruction}-${index}`}><span>{index + 1}</span><p>{step.instruction}<small>{Math.round(step.distanceMeters)} m</small></p></div>)}</div>}
          <p className="narration">“{result.narration.text}”</p>
          {result.narration.audioDataUri && <audio controls src={result.narration.audioDataUri} />}
          <button className="start-run" onClick={() => { setTrackedMeters(0); setIsRunning(true); }}>Start run <span>→</span></button>
          <p className="lockup">Start the briefing, lock your phone, and go.</p>
        </section>
      )}
      <footer>microclimate runner <span>·</span> open source tools for better outdoor miles</footer>
    </main>
  );
}
import dynamic from "next/dynamic";

const RouteMap = dynamic(
  () => import("./components/RouteMap"),
  { ssr: false },
);