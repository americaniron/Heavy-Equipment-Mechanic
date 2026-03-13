import { getAvatarInfo } from "./avatar";

const DID_API = "https://api.d-id.com";

type DIDPresenterConfig = {
  presenterId: string;
  sourceUrl: string;
  voiceType: string;
  voiceId: string;
  name: string;
  gender: string;
};

const PRESENTER_MAP_EN: Record<string, DIDPresenterConfig> = {
  admin: {
    presenterId: "v2_public_Amber_BlackJacket_HomeOffice@9WuHtiUDnL",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Amber_BlackJacket_HomeOffice/9WuHtiUDnL/Sc6QllBjEE/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-JennyMultilingualV2Neural",
    name: "Sarah",
    gender: "female",
  },
  heavy_equipment: {
    presenterId: "v2_public_Adam_GreenShirt_Outdoor@lCt14o5o4r",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Adam_GreenShirt_Outdoor/lCt14o5o4r/edTFEy9IG_/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-GuyNeural",
    name: "Bryan",
    gender: "male",
  },
  power_gen: {
    presenterId: "v2_public_fiona_blue_shirt_lab@FQBA_hemBB",
    sourceUrl: "https://clips-presenters.d-id.com/v2/fiona_blue_shirt_lab/FQBA_hemBB/SbQyQr6H5b/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-AriaNeural",
    name: "Elenora",
    gender: "female",
  },
  marine: {
    presenterId: "v2_public_dylan_dark_grey_shirt_nature@4DwMS4ibcR",
    sourceUrl: "https://clips-presenters.d-id.com/v2/dylan_dark_grey_shirt_nature/4DwMS4ibcR/8AOgVavfzg/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-DavisNeural",
    name: "Pedro",
    gender: "male",
  },
  hydraulics: {
    presenterId: "v2_public_ethan@hmt8kojzjp",
    sourceUrl: "https://clips-presenters.d-id.com/v2/ethan/hmt8kojzjp/traoowwmob/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-TonyNeural",
    name: "Thaddeus",
    gender: "male",
  },
  electrical: {
    presenterId: "v2_public_ella_pink_shirt_classroom@wmnCN4_87Q",
    sourceUrl: "https://clips-presenters.d-id.com/v2/ella_pink_shirt_classroom/wmnCN4_87Q/tNGWKcDea1/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-JennyNeural",
    name: "Anastasia",
    gender: "female",
  },
  parts: {
    presenterId: "v2_public_eugene_black_shirt_lobby@CthhIOV7vW",
    sourceUrl: "https://clips-presenters.d-id.com/v2/eugene_black_shirt_lobby/CthhIOV7vW/GrsTVHDhB7/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-BrandonNeural",
    name: "Marcus",
    gender: "male",
  },
};

const PRESENTER_MAP_AR: Record<string, DIDPresenterConfig> = {
  admin: {
    presenterId: "v2_public_Amber_BlackJacket_HomeOffice@9WuHtiUDnL",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Amber_BlackJacket_HomeOffice/9WuHtiUDnL/Sc6QllBjEE/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-ZariyahNeural",
    name: "سارة",
    gender: "female",
  },
  heavy_equipment: {
    presenterId: "v2_public_Adam_GreenShirt_Outdoor@lCt14o5o4r",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Adam_GreenShirt_Outdoor/lCt14o5o4r/edTFEy9IG_/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-HamedNeural",
    name: "خالد",
    gender: "male",
  },
  power_gen: {
    presenterId: "v2_public_fiona_blue_shirt_lab@FQBA_hemBB",
    sourceUrl: "https://clips-presenters.d-id.com/v2/fiona_blue_shirt_lab/FQBA_hemBB/SbQyQr6H5b/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-ZariyahNeural",
    name: "ليلى",
    gender: "female",
  },
  marine: {
    presenterId: "v2_public_dylan_dark_grey_shirt_nature@4DwMS4ibcR",
    sourceUrl: "https://clips-presenters.d-id.com/v2/dylan_dark_grey_shirt_nature/4DwMS4ibcR/8AOgVavfzg/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-HamedNeural",
    name: "عمر",
    gender: "male",
  },
  hydraulics: {
    presenterId: "v2_public_ethan@hmt8kojzjp",
    sourceUrl: "https://clips-presenters.d-id.com/v2/ethan/hmt8kojzjp/traoowwmob/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-HamedNeural",
    name: "حسن",
    gender: "male",
  },
  electrical: {
    presenterId: "v2_public_ella_pink_shirt_classroom@wmnCN4_87Q",
    sourceUrl: "https://clips-presenters.d-id.com/v2/ella_pink_shirt_classroom/wmnCN4_87Q/tNGWKcDea1/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-ZariyahNeural",
    name: "نور",
    gender: "female",
  },
  parts: {
    presenterId: "v2_public_eugene_black_shirt_lobby@CthhIOV7vW",
    sourceUrl: "https://clips-presenters.d-id.com/v2/eugene_black_shirt_lobby/CthhIOV7vW/GrsTVHDhB7/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-HamedNeural",
    name: "طارق",
    gender: "male",
  },
};

const PRESENTER_MAPS: Record<string, Record<string, DIDPresenterConfig>> = {
  en: PRESENTER_MAP_EN,
  ar: PRESENTER_MAP_AR,
};

const agentCache: Record<string, string> = {};
const activeStreams: Map<string, { agentId: string; streamId: string; sessionId: string }> = new Map();

export function clearDIDAgentCache(): void {
  for (const key of Object.keys(agentCache)) {
    delete agentCache[key];
  }
  console.log("[D-ID] Agent cache cleared — new agents will use updated presenters");
}

function getApiKey(): string {
  const key = process.env.DID_API_KEY;
  if (!key) throw new Error("DID_API_KEY not configured");
  return key;
}

function getAuthHeader(): string {
  return `Basic ${Buffer.from(getApiKey() + ":").toString("base64")}`;
}

function getPersonaInstructions(agentType: string, language: string): string {
  const info = getAvatarInfo(agentType, language);
  return info?.persona || "You are a helpful assistant at American Iron.";
}

async function getOrCreateAgent(agentType: string, language: string): Promise<string> {
  const cacheKey = `${agentType}_${language}`;
  if (agentCache[cacheKey]) return agentCache[cacheKey];

  const presenterMap = PRESENTER_MAPS[language] || PRESENTER_MAPS.en;
  const presenter = presenterMap[agentType] || presenterMap.admin;
  const persona = getPersonaInstructions(agentType, language);

  const body = {
    presenter: {
      type: "talk" as const,
      voice: {
        type: presenter.voiceType,
        voice_id: presenter.voiceId,
      },
      source_url: presenter.sourceUrl,
      thumbnail: presenter.sourceUrl,
    },
    llm: {
      type: "openai" as const,
      provider: "openai" as const,
      model: "gpt-4o-mini",
      instructions: persona,
    },
    preview_name: presenter.name,
  };

  console.log(`[D-ID] Creating agent for ${agentType}/${language}: ${presenter.name}`);

  const res = await fetch(`${DID_API}/agents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[D-ID] Failed to create agent:`, res.status, errText);
    throw new Error(`D-ID create agent error: ${res.status}`);
  }

  const data = await res.json();
  const agentId = data.id;
  agentCache[cacheKey] = agentId;
  console.log(`[D-ID] Agent created: ${agentId} for ${cacheKey}`);
  return agentId;
}

export async function createDIDStream(agentType: string = "admin", language: string = "en"): Promise<{
  provider: "did";
  agentId: string;
  streamId: string;
  sessionId: string;
  offer: string;
  iceServers: Array<{ urls: string[] }>;
}> {
  const agentId = await getOrCreateAgent(agentType, language);

  const existingKey = `${agentType}_${language}`;
  const existing = activeStreams.get(existingKey);
  if (existing) {
    try {
      console.log(`[D-ID] Cleaning up old stream ${existing.streamId} for ${existingKey}`);
      await closeDIDStream(existing.agentId, existing.streamId, existing.sessionId);
    } catch {}
    activeStreams.delete(existingKey);
  }

  console.log(`[D-ID] Creating stream for agent ${agentId}`);
  const res = await fetch(`${DID_API}/agents/${agentId}/streams`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[D-ID] Failed to create stream:`, res.status, errText);
    throw new Error(`D-ID create stream error: ${res.status}`);
  }

  const setCookieHeader = res.headers.get("set-cookie") || "";
  const data = await res.json();

  const sessionId = data.session_id || setCookieHeader || data.id;
  const offerSdp = typeof data.offer === "string" ? data.offer : (data.offer?.sdp || data.offer);
  console.log(`[D-ID] Stream created: ${data.id}, session_id present: ${!!sessionId}, offer type: ${typeof offerSdp}`);

  activeStreams.set(existingKey, { agentId, streamId: data.id, sessionId });

  return {
    provider: "did",
    agentId,
    streamId: data.id,
    sessionId: sessionId,
    offer: offerSdp,
    iceServers: data.ice_servers || [{ urls: ["stun:stun.l.google.com:19302"] }],
  };
}

export async function sendDIDSdpAnswer(agentId: string, streamId: string, sessionId: string, answer: string): Promise<void> {
  console.log(`[D-ID] Sending SDP answer for stream ${streamId}`);
  const res = await fetch(`${DID_API}/agents/${agentId}/streams/${streamId}/sdp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({ answer: { type: "answer", sdp: answer }, session_id: sessionId }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[D-ID] SDP answer failed:`, res.status, errText);
    throw new Error(`D-ID SDP error: ${res.status}`);
  }
  console.log(`[D-ID] SDP answer accepted`);
}

export async function sendDIDIceCandidate(
  agentId: string,
  streamId: string,
  sessionId: string,
  candidate: string,
  sdpMid: string,
  sdpMLineIndex: number
): Promise<void> {
  const res = await fetch(`${DID_API}/agents/${agentId}/streams/${streamId}/ice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      candidate,
      sdpMid,
      sdpMLineIndex,
      session_id: sessionId,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[D-ID] ICE candidate failed:`, res.status, errText);
  }
}

export async function sendDIDSpeak(agentId: string, streamId: string, sessionId: string, text: string): Promise<void> {
  console.log(`[D-ID] Sending speak: "${text.substring(0, 60)}..."`);

  const enhancedBody = {
    script: { type: "text" as const, input: text, ssml: false },
    config: {
      stitch: true,
      fluent: true,
      align_driver: true,
      sharpen: true,
      auto_match: true,
      normalization_factor: 0.1,
      motion_factor: 0.55,
    },
    session_id: sessionId,
  };

  const res = await fetch(`${DID_API}/agents/${agentId}/streams/${streamId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
    body: JSON.stringify(enhancedBody),
  });

  if (res.ok) {
    console.log(`[D-ID] Speak command sent (enhanced config)`);
    return;
  }

  const errText = await res.text();
  if (res.status >= 400 && res.status < 500) {
    console.warn(`[D-ID] Enhanced speak rejected (${res.status}), retrying with minimal config`);
    const minimalBody = {
      script: { type: "text" as const, input: text },
      config: { stitch: true },
      session_id: sessionId,
    };
    const retryRes = await fetch(`${DID_API}/agents/${agentId}/streams/${streamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
      body: JSON.stringify(minimalBody),
    });
    if (!retryRes.ok) {
      const retryErr = await retryRes.text();
      console.error(`[D-ID] Minimal speak also failed:`, retryRes.status, retryErr);
      throw new Error(`D-ID speak error: ${retryRes.status}`);
    }
    console.log(`[D-ID] Speak command sent (minimal config fallback)`);
    return;
  }

  console.error(`[D-ID] Speak failed:`, res.status, errText);
  throw new Error(`D-ID speak error: ${res.status}`);
}

export async function closeDIDStream(agentId: string, streamId: string, sessionId: string): Promise<void> {
  try {
    console.log(`[D-ID] Closing stream ${streamId}`);
    await fetch(`${DID_API}/agents/${agentId}/streams/${streamId}`, {
      method: "DELETE",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_id: sessionId }),
    });
    for (const [key, s] of activeStreams.entries()) {
      if (s.streamId === streamId) { activeStreams.delete(key); break; }
    }
    console.log(`[D-ID] Stream closed`);
  } catch (err) {
    console.error("[D-ID] Error closing stream:", err);
  }
}

export function getDIDPresenterInfo(agentType: string = "admin", language: string = "en"): DIDPresenterConfig {
  const presenterMap = PRESENTER_MAPS[language] || PRESENTER_MAPS.en;
  return presenterMap[agentType] || presenterMap.admin;
}
