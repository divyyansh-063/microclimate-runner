import { NextResponse } from "next/server";
import { z } from "zod";
import { planRoute } from "@/mastra";

const requestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  targetDistanceKm: z.number().min(1).max(30).default(5),
  priority: z.enum(["shade", "pollen", "balanced"]).default("balanced"),
  surface: z.enum(["any", "paved", "trail"]).default("any"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = requestSchema.parse(body);
    const result = await planRoute(
      { latitude: input.latitude, longitude: input.longitude },
      {
        targetDistanceKm: input.targetDistanceKm,
        priority: input.priority,
        surface: input.surface,
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
    }

    console.error("Route planner failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to plan a route right now." },
      { status: 502 },
    );
  }
}