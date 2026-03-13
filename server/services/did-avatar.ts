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
    presenterId: "v2_public_Amber@0zSz8kflCN",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Amber/0zSz8kflCN/OUM7xZOuD5/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-JennyMultilingualV2Neural",
    name: "Sarah",
    gender: "female",
  },
  heavy_equipment: {
    presenterId: "v2_public_Adam_BlackShirt_Library@6uEefixtDc",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Adam/6uEefixtDc/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-GuyNeural",
    name: "Bryan",
    gender: "male",
  },
  power_gen: {
    presenterId: "v2_public_Amber_WhiteBlueShirt_Outdoor@k_pw06LqHE",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Amber/k_pw06LqHE/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-AriaNeural",
    name: "Elenora",
    gender: "female",
  },
  marine: {
    presenterId: "v2_public_alex_black_suite_green_screen@u8RGmlrjpD",
    sourceUrl: "https://clips-presenters.d-id.com/v2/alex/u8RGmlrjpD/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-DavisNeural",
    name: "Pedro",
    gender: "male",
  },
  hydraulics: {
    presenterId: "v2_public_Adam_WhiteBlueShirt_LivingRoom@kwLwo22I6I",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Adam/kwLwo22I6I/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-TonyNeural",
    name: "Thaddeus",
    gender: "male",
  },
  electrical: {
    presenterId: "v2_public_Amber_RedSweater_HomeOffice@atjDiWT4JK",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Amber/atjDiWT4JK/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-JennyNeural",
    name: "Anastasia",
    gender: "female",
  },
  parts: {
    presenterId: "v2_public_alex_biege_shirt_green_screen@sNZgzDrsOE",
    sourceUrl: "https://clips-presenters.d-id.com/v2/alex/sNZgzDrsOE/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-BrandonNeural",
    name: "Marcus",
    gender: "male",
  },
};

const PRESENTER_MAP_AR: Record<string, DIDPresenterConfig> = {
  admin: {
    presenterId: "v2_public_Amber@0zSz8kflCN",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Amber/0zSz8kflCN/OUM7xZOuD5/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-ZariyahNeural",
    name: "سارة",
    gender: "female",
  },
  heavy_equipment: {
    presenterId: "v2_public_Adam_BlackShirt_Library@6uEefixtDc",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Adam/6uEefixtDc/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-HamedNeural",
    name: "خالد",
    gender: "male",
  },
  power_gen: {
    presenterId: "v2_public_Amber_WhiteBlueShirt_Outdoor@k_pw06LqHE",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Amber/k_pw06LqHE/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-ZariyahNeural",
    name: "ليلى",
    gender: "female",
  },
  marine: {
    presenterId: "v2_public_alex_black_suite_green_screen@u8RGmlrjpD",
    sourceUrl: "https://clips-presenters.d-id.com/v2/alex/u8RGmlrjpD/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-HamedNeural",
    name: "عمر",
    gender: "male",
  },
  hydraulics: {
    presenterId: "v2_public_Adam_WhiteBlueShirt_LivingRoom@kwLwo22I6I",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Adam/kwLwo22I6I/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-HamedNeural",
    name: "حسن",
    gender: "male",
  },
  electrical: {
    presenterId: "v2_public_Amber_RedSweater_HomeOffice@atjDiWT4JK",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Amber/atjDiWT4JK/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-ZariyahNeural",
    name: "نور",
    gender: "female",
  },
  parts: {
    presenterId: "v2_public_alex_biege_shirt_green_screen@sNZgzDrsOE",
    sourceUrl: "https://clips-presenters.d-id.com/v2/alex/sNZgzDrsOE/image.png",
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
const activeStreams: Array<{ agentId: string; streamId: string; sessionId: string }> = [];

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

  for (const old of activeStreams.splice(0)) {
    try {
      console.log(`[D-ID] Cleaning up old stream ${old.streamId}`);
      await closeDIDStream(old.agentId, old.streamId, old.sessionId);
    } catch {}
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

  activeStreams.push({ agentId, streamId: data.id, sessionId });

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
    body: JSON.stringify({ answer, session_id: sessionId }),
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
  const res = await fetch(`${DID_API}/agents/${agentId}/streams/${streamId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      script: {
        type: "text",
        input: text,
      },
      session_id: sessionId,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[D-ID] Speak failed:`, res.status, errText);
    throw new Error(`D-ID speak error: ${res.status}`);
  }
  console.log(`[D-ID] Speak command sent`);
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
    const idx = activeStreams.findIndex(s => s.streamId === streamId);
    if (idx >= 0) activeStreams.splice(idx, 1);
    console.log(`[D-ID] Stream closed`);
  } catch (err) {
    console.error("[D-ID] Error closing stream:", err);
  }
}

export function getDIDPresenterInfo(agentType: string = "admin", language: string = "en"): DIDPresenterConfig {
  const presenterMap = PRESENTER_MAPS[language] || PRESENTER_MAPS.en;
  return presenterMap[agentType] || presenterMap.admin;
}
