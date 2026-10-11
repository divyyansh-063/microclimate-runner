# Microclimate Runner

Microclimate Runner is a minimal, open-source run route planner. It uses your location to find nearby OSM footpaths, scores candidates for shade and lower pollen exposure, and optionally turns the recommendation into a short ElevenLabs audio guide.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), allow location access, and press **Plan my run**.

The app works without provider credentials: OSM candidates fall back to local generated candidates if Overpass is unavailable, and the UI displays the narration as text when ElevenLabs is not configured.

## Environment variables

Create `.env.local` for audio narration:

```env
ELEVENLABS_API_KEY=your_api_key
ELEVENLABS_VOICE_ID=your_voice_id
OLLAMA_GEMMA_MODEL=gemma2:2b
```

Install [Ollama](https://ollama.com), then pull the local model:

```bash
ollama pull gemma2:2b
```

Start Ollama before using local Gemma:

```bash
ollama serve
```

The API key is only read on the server. Never expose it as a `NEXT_PUBLIC_` variable.

## Architecture

`src/app/page.tsx` requests browser geolocation and calls `POST /api/route-planner`.

The route planner workflow in `src/mastra/workflows/route-workflow.ts` orchestrates:

1. `osm-tool.ts` — fetches nearby footway, path, pedestrian, track, and cycleway geometries from OpenStreetMap Overpass.
2. `environment-tool.ts` — fetches current temperature, UV, wind, and available pollen indicators from Open-Meteo. It returns neutral fallback conditions if the provider is unavailable.
3. `gemma-tool.ts` — sends route features and runner preferences to a local Gemma model through Ollama. The response is schema-validated before it can affect route ranking.
4. `tabpfn-tool.ts` — provides the deterministic heuristic fallback for shade, lower pollen risk, and overall comfort.
5. `elevenlabs-tool.ts` — creates an MP3 data URI when ElevenLabs credentials are configured.

When Ollama is unavailable, the app explicitly returns `heuristic-fallback` instead of pretending that Gemma was used. Precise location is sent only to the route and environmental providers; route ranking stays local when Ollama is configured.

## Touch Grass challenge checklist

- **Theme:** the runner spends a few seconds choosing a route, then can switch to Run Mode and leave the screen.
- **Open-source AI:** local Gemma (`gemma2:2b`) ranks route candidates through Ollama. The UI reports when it falls back to deterministic scoring.
- **Open innovation:** the model can be swapped locally, route-ranking data stays on the runner's machine, and the scoring prompt is inspectable.
- **Partner technology:** Mastra-style workflow orchestration, OpenRouteService connected routing, Open-Meteo conditions, and optional ElevenLabs narration.
- **Demo proof to capture:** one screen recording showing preferences, a connected route, `Ranked privately by local Gemma`, the route preview, and Run Mode.

For the DEV submission, publish a post with the required tags `#devchallenge` and `#hf26challenge`. Explain what runs locally, what data is sent to external services, why the screen becomes unnecessary after planning, and what happened when you tested the route outdoors.

## Validation

```bash
npm run lint
npm exec tsc -- --noEmit
npm run build
```
