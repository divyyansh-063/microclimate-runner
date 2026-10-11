import type { ScoredPath } from "./tabpfn-tool";

export type Narration = {
  text: string;
  audioDataUri?: string;
};

function describeRoute(path: ScoredPath): string {
  return `Your route is ${path.name}. It scores ${path.shadeScore}% for shade and ${path.pollenScore}% for low pollen. Keep to the ${path.surface} path and enjoy your run.`;
}

export async function createNarration(path: ScoredPath): Promise<Narration> {
  const text = describeRoute(path);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return { text };
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.55, similarity_boost: 0.75 },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs narration failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const audio = Buffer.from(await response.arrayBuffer()).toString("base64");
  return { text, audioDataUri: `data:audio/mpeg;base64,${audio}` };
}