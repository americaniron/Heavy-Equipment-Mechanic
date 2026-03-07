const HEYGEN_API_BASE = "https://api.heygen.com";

export async function createStreamingToken(): Promise<string> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error("HEYGEN_API_KEY not configured");

  const response = await fetch(`${HEYGEN_API_BASE}/v1/streaming.create_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("HeyGen token creation failed:", response.status, errText);
    throw new Error(`HeyGen token error: ${response.status}`);
  }

  const data = await response.json();
  return data.data?.token || data.token;
}

export async function listAvatars(): Promise<any[]> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(`${HEYGEN_API_BASE}/v1/interactive_avatars`, {
      headers: { "X-Api-Key": apiKey },
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.data?.interactive_avatars || data.interactive_avatars || [];
  } catch {
    return [];
  }
}

export async function listVoices(): Promise<any[]> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(`${HEYGEN_API_BASE}/v2/voices`, {
      headers: { "X-Api-Key": apiKey },
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.data?.voices || data.voices || [];
  } catch {
    return [];
  }
}
