const DID_API_BASE = "https://api.d-id.com";

const PRESENTER_PHOTOS: Record<string, string> = {
  admin: "https://d-id-public-bucket.s3.us-west-2.amazonaws.com/alice.jpg",
  heavy_equipment: "https://d-id-public-bucket.s3.us-west-2.amazonaws.com/noelle.jpg",
  power_gen: "https://d-id-public-bucket.s3.us-west-2.amazonaws.com/alice.jpg",
  marine: "https://d-id-public-bucket.s3.us-west-2.amazonaws.com/noelle.jpg",
  hydraulics: "https://d-id-public-bucket.s3.us-west-2.amazonaws.com/alice.jpg",
  electrical: "https://d-id-public-bucket.s3.us-west-2.amazonaws.com/noelle.jpg",
};

const VOICE_IDS: Record<string, string> = {
  admin: "en-US-JennyNeural",
  heavy_equipment: "en-US-GuyNeural",
  power_gen: "en-US-JennyNeural",
  marine: "en-US-GuyNeural",
  hydraulics: "en-US-GuyNeural",
  electrical: "en-US-JennyNeural",
};

function getApiKey(): string {
  const key = process.env.DID_API_KEY;
  if (!key) throw new Error("DID_API_KEY not configured");
  return key;
}

export async function createTalkingVideo(
  text: string,
  agentType: string = "admin"
): Promise<{ talkId: string }> {
  const key = getApiKey();
  const sourceUrl = PRESENTER_PHOTOS[agentType] || PRESENTER_PHOTOS.admin;
  const voiceId = VOICE_IDS[agentType] || VOICE_IDS.admin;

  const speakText = text.length > 500 ? text.substring(0, 497) + "..." : text;

  const response = await fetch(`${DID_API_BASE}/talks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${key}`,
    },
    body: JSON.stringify({
      source_url: sourceUrl,
      script: {
        type: "text",
        input: speakText,
        provider: { type: "microsoft", voice_id: voiceId },
      },
      config: { stitch: true },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("D-ID talk creation failed:", response.status, errText);
    throw new Error(`D-ID error: ${response.status}`);
  }

  const data = await response.json();
  return { talkId: data.id };
}

export async function getTalkStatus(
  talkId: string
): Promise<{ status: string; resultUrl?: string; duration?: number }> {
  const key = getApiKey();

  const response = await fetch(`${DID_API_BASE}/talks/${talkId}`, {
    headers: { "Authorization": `Basic ${key}` },
  });

  if (!response.ok) {
    throw new Error(`D-ID status check error: ${response.status}`);
  }

  const data = await response.json();
  return {
    status: data.status,
    resultUrl: data.result_url,
    duration: data.duration,
  };
}

export async function waitForTalk(
  talkId: string,
  maxWaitMs: number = 30000
): Promise<{ resultUrl: string; duration: number }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await getTalkStatus(talkId);

    if (result.status === "done" && result.resultUrl) {
      return { resultUrl: result.resultUrl, duration: result.duration || 0 };
    }

    if (result.status === "error") {
      throw new Error("D-ID video generation failed");
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("D-ID video generation timed out");
}

export async function getPresenterPhoto(agentType: string = "admin"): Promise<string> {
  return PRESENTER_PHOTOS[agentType] || PRESENTER_PHOTOS.admin;
}

export async function checkCredits(): Promise<number> {
  try {
    const key = getApiKey();
    const response = await fetch(`${DID_API_BASE}/credits`, {
      headers: { "Authorization": `Basic ${key}` },
    });
    if (!response.ok) return 0;
    const data = await response.json();
    return data.remaining || 0;
  } catch {
    return 0;
  }
}
