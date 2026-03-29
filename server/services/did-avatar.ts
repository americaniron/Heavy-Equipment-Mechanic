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

const WB = `(?:^|[\\s.,!?;:،؛؟])`;
const WBE = `(?=$|[\\s.,!?;:،؛؟])`;

const GREETING_PATTERNS = new RegExp(`${WB}(hello|hi|hey|welcome|good morning|good afternoon|good evening|greetings|مرحبا|أهلا|السلام عليكم|أهلاً)${WBE}`, "i");
const POSITIVE_PATTERNS = new RegExp(`${WB}(great|excellent|perfect|wonderful|fantastic|happy|glad|pleased|sure|absolutely|certainly|of course|no problem|you're welcome|thank|appreciate|congratulations|awesome|good news|ممتاز|رائع|جيد|شكرا|شكراً|مبارك|بالتأكيد|طبعا|طبعاً)${WBE}`, "i");
const CONCERN_PATTERNS = new RegExp(`${WB}(sorry|unfortunately|problem|issue|concern|trouble|difficult|fail|error|broken|damage|leak|malfunction|warning|caution|urgent|critical|emergency|عذرا|عذراً|مشكلة|خطأ|عطل|تسرب|تحذير|طارئ|للأسف|صعب)${WBE}`, "i");
const QUESTION_PATTERNS = new RegExp(`${WB}(can you|could you|would you|what|how|when|where|why|which|tell me|let me know|هل|ما|كيف|متى|أين|لماذا|أخبرني)${WBE}`, "i");
const EXPLAIN_PATTERNS = new RegExp(`${WB}(let me explain|here's what|the reason|because|first|second|third|step|process|procedure|recommend|suggest|important|note that|keep in mind|اسمح لي|السبب|الخطوة|أوصي|مهم|أولا|أولاً|ثانيا|ثانياً|ثالثا|ثالثاً|لأن)${WBE}`, "i");
const EMPATHY_PATTERNS = new RegExp(`${WB}(understand|i see|that makes sense|of course|no worries|don't worry|i hear you|rest assured|we'll take care|أفهم|لا تقلق|سنهتم|بالطبع|أسمعك|لا تخف)${WBE}`, "i");

type VoiceStyle = "cheerful" | "friendly" | "empathetic" | "chat" | "customerservice" | "hopeful" | "excited";

function analyzeVoiceStyle(text: string): VoiceStyle {
  if (GREETING_PATTERNS.test(text) && POSITIVE_PATTERNS.test(text)) return "cheerful";
  if (GREETING_PATTERNS.test(text)) return "friendly";
  if (CONCERN_PATTERNS.test(text) && EMPATHY_PATTERNS.test(text)) return "empathetic";
  if (CONCERN_PATTERNS.test(text)) return "empathetic";
  if (EMPATHY_PATTERNS.test(text)) return "empathetic";
  if (POSITIVE_PATTERNS.test(text)) return "cheerful";
  if (EXPLAIN_PATTERNS.test(text)) return "chat";
  if (QUESTION_PATTERNS.test(text)) return "friendly";
  return "chat";
}

function addSSMLBreaks(text: string): string {
  let ssml = text;
  ssml = ssml.replace(/([.!?؟])\s+/g, '$1 <break time="400ms"/> ');
  ssml = ssml.replace(/([,،;؛:])\s+/g, '$1 <break time="200ms"/> ');
  ssml = ssml.replace(/(—|–)\s*/g, '$1 <break time="300ms"/> ');
  return ssml;
}

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
    presenterId: "v2_public_Matt_NoHands_GreyTshirt_Outdoor@rwE9avfhZE",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Matt_NoHands_GreyTshirt_Outdoor/rwE9avfhZE/Kx_xEIPaws/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-BrandonMultilingualNeural",
    name: "Mike",
    gender: "male",
  },
  power_gen: {
    presenterId: "v2_public_Amber_WhiteBlueShirt_Outdoor@k_pw06LqHE",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Amber_WhiteBlueShirt_Outdoor/k_pw06LqHE/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-EmmaMultilingualNeural",
    name: "Sarah C.",
    gender: "female",
  },
  marine: {
    presenterId: "v2_public_Dylan_NoHands_GreyTshirt_Outdoor@IklZc5mZIC",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Dylan_NoHands_GreyTshirt_Outdoor/IklZc5mZIC/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-BrandonMultilingualNeural",
    name: "James",
    gender: "male",
  },
  hydraulics: {
    presenterId: "v2_public_Joseph_NoHands_OrangeShirt_Lab@hfdqirrsX9",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Joseph_NoHands_OrangeShirt_Lab/hfdqirrsX9/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-OnyxTurboMultilingualNeural",
    name: "David",
    gender: "male",
  },
  electrical: {
    presenterId: "v2_public_Kayla_NoHands_BlackShirt_Lab@DBhQkMdJDF",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Kayla_NoHands_BlackShirt_Lab/DBhQkMdJDF/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-NovaTurboMultilingualNeural",
    name: "Elena",
    gender: "female",
  },
  parts: {
    presenterId: "v2_public_Frank_NoHands_GreyJacket_CoffeeShop@HT3CCjVvV3",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Frank_NoHands_GreyJacket_CoffeeShop/HT3CCjVvV3/image.png",
    voiceType: "microsoft",
    voiceId: "en-US-AlloyTurboMultilingualNeural",
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
    name: "فاطمة",
    gender: "female",
  },
  heavy_equipment: {
    presenterId: "v2_public_Matt_NoHands_GreyTshirt_Outdoor@rwE9avfhZE",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Matt_NoHands_GreyTshirt_Outdoor/rwE9avfhZE/Kx_xEIPaws/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-HamedNeural",
    name: "خالد",
    gender: "male",
  },
  power_gen: {
    presenterId: "v2_public_Amber_WhiteBlueShirt_Outdoor@k_pw06LqHE",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Amber_WhiteBlueShirt_Outdoor/k_pw06LqHE/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-ZariyahNeural",
    name: "ليلى",
    gender: "female",
  },
  marine: {
    presenterId: "v2_public_Dylan_NoHands_GreyTshirt_Outdoor@IklZc5mZIC",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Dylan_NoHands_GreyTshirt_Outdoor/IklZc5mZIC/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-HamedNeural",
    name: "عمر",
    gender: "male",
  },
  hydraulics: {
    presenterId: "v2_public_Joseph_NoHands_OrangeShirt_Lab@hfdqirrsX9",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Joseph_NoHands_OrangeShirt_Lab/hfdqirrsX9/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-HamedNeural",
    name: "حسن",
    gender: "male",
  },
  electrical: {
    presenterId: "v2_public_Kayla_NoHands_BlackShirt_Lab@DBhQkMdJDF",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Kayla_NoHands_BlackShirt_Lab/DBhQkMdJDF/image.png",
    voiceType: "microsoft",
    voiceId: "ar-SA-ZariyahNeural",
    name: "نور",
    gender: "female",
  },
  parts: {
    presenterId: "v2_public_Frank_NoHands_GreyJacket_CoffeeShop@HT3CCjVvV3",
    sourceUrl: "https://clips-presenters.d-id.com/v2/Frank_NoHands_GreyJacket_CoffeeShop/HT3CCjVvV3/image.png",
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
  const key = getApiKey();
  if (key.includes(":")) {
    return `Basic ${key}`;
  }
  return `Basic ${Buffer.from(key + ":").toString("base64")}`;
}

export async function checkDIDCredits(): Promise<number> {
  try {
    const res = await fetch(`${DID_API}/credits`, {
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    console.log(`[D-ID] Credits remaining: ${data.remaining}/${data.total}`);
    return data.remaining || 0;
  } catch (e: any) {
    console.warn(`[D-ID] Credit check failed:`, e.message);
    return 0;
  }
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
      type: "clip" as const,
      presenter_id: presenter.presenterId,
      voice: {
        type: presenter.voiceType,
        voice_id: presenter.voiceId,
      },
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
  const maxRetries = 3;
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[D-ID] Sending SDP answer for stream ${streamId} (attempt ${attempt}/${maxRetries})`);
      const res = await fetch(`${DID_API}/agents/${agentId}/streams/${streamId}/sdp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthHeader(),
        },
        body: JSON.stringify({ answer: { type: "answer", sdp: answer }, session_id: sessionId }),
      });

      if (res.ok) {
        console.log(`[D-ID] SDP answer accepted`);
        return;
      }

      const errText = await res.text();
      console.error(`[D-ID] SDP answer failed (attempt ${attempt}):`, res.status, errText);

      if (attempt < maxRetries && retryableStatuses.has(res.status)) {
        const delay = attempt * 1200 + Math.random() * 500;
        console.log(`[D-ID] Retrying SDP in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw new Error(`D-ID SDP error: ${res.status}`);
    } catch (err: any) {
      if (err?.message?.startsWith("D-ID SDP error:")) throw err;
      console.error(`[D-ID] SDP network error (attempt ${attempt}):`, err?.message || err);
      if (attempt < maxRetries) {
        const delay = attempt * 1500;
        console.log(`[D-ID] Retrying SDP after network error in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`D-ID SDP network error after ${maxRetries} attempts`);
    }
  }
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

export async function sendDIDSpeak(
  agentId: string,
  streamId: string,
  sessionId: string,
  text: string,
  agentType: string = "admin",
  language: string = "en"
): Promise<void> {
  console.log(`[D-ID] Sending speak: "${text.substring(0, 60)}..."`);

  const presenterMap = PRESENTER_MAPS[language] || PRESENTER_MAPS.en;
  const presenter = presenterMap[agentType] || presenterMap.admin;
  const voiceStyle = analyzeVoiceStyle(text);
  const ssmlText = addSSMLBreaks(text);

  const speakBody: any = {
    script: {
      type: "text" as const,
      input: ssmlText,
      ssml: true,
      provider: {
        type: presenter.voiceType,
        voice_id: presenter.voiceId,
        voice_config: {
          style: voiceStyle,
        },
      },
    },
    session_id: sessionId,
  };

  console.log(`[D-ID] Speak (style: ${voiceStyle}, voice: ${presenter.voiceId}, ssml: true, len: ${text.length})`);

  const res = await fetch(`${DID_API}/agents/${agentId}/streams/${streamId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
    body: JSON.stringify(speakBody),
  });

  if (res.ok) {
    console.log(`[D-ID] Speak sent successfully (style: ${voiceStyle})`);
    return;
  }

  const errText = await res.text();
  console.warn(`[D-ID] Styled speak rejected (${res.status}): ${errText.substring(0, 200)}`);

  if (res.status >= 400 && res.status < 500) {
    const fallbackBody: any = {
      script: {
        type: "text" as const,
        input: ssmlText,
        ssml: true,
        provider: {
          type: presenter.voiceType,
          voice_id: presenter.voiceId,
        },
      },
      session_id: sessionId,
    };
    console.log(`[D-ID] Retrying without voice_config style...`);
    const retryRes = await fetch(`${DID_API}/agents/${agentId}/streams/${streamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
      body: JSON.stringify(fallbackBody),
    });
    if (retryRes.ok) {
      console.log(`[D-ID] Speak sent (no style fallback, ssml preserved)`);
      return;
    }
    const retryErr = await retryRes.text();
    console.warn(`[D-ID] SSML speak also rejected (${retryRes.status}), trying plain text...`);

    const plainBody = {
      script: {
        type: "text" as const,
        input: text,
      },
      session_id: sessionId,
    };
    const plainRes = await fetch(`${DID_API}/agents/${agentId}/streams/${streamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
      body: JSON.stringify(plainBody),
    });
    if (!plainRes.ok) {
      const plainErr = await plainRes.text();
      console.error(`[D-ID] All speak attempts failed:`, plainRes.status, plainErr);
      throw new Error(`D-ID speak error: ${plainRes.status}`);
    }
    console.log(`[D-ID] Speak sent (plain text fallback)`);
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
