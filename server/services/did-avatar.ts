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

type DIDExpression = {
  start_frame: number;
  expression: "happy" | "surprise" | "serious" | "neutral";
  intensity: number;
};

const WB = `(?:^|[\\s.,!?;:،؛؟])`;
const WBE = `(?=$|[\\s.,!?;:،؛؟])`;

const GREETING_PATTERNS = new RegExp(`${WB}(hello|hi|hey|welcome|good morning|good afternoon|good evening|greetings|مرحبا|أهلا|السلام عليكم|أهلاً)${WBE}`, "i");
const POSITIVE_PATTERNS = new RegExp(`${WB}(great|excellent|perfect|wonderful|fantastic|happy|glad|pleased|sure|absolutely|certainly|of course|no problem|you're welcome|thank|appreciate|congratulations|awesome|good news|ممتاز|رائع|جيد|شكرا|شكراً|مبارك|بالتأكيد|طبعا|طبعاً)${WBE}`, "i");
const CONCERN_PATTERNS = new RegExp(`${WB}(sorry|unfortunately|problem|issue|concern|trouble|difficult|fail|error|broken|damage|leak|malfunction|warning|caution|urgent|critical|emergency|عذرا|عذراً|مشكلة|خطأ|عطل|تسرب|تحذير|طارئ|للأسف|صعب)${WBE}`, "i");
const QUESTION_PATTERNS = new RegExp(`${WB}(can you|could you|would you|what|how|when|where|why|which|tell me|let me know|هل|ما|كيف|متى|أين|لماذا|أخبرني)${WBE}`, "i");
const EXPLAIN_PATTERNS = new RegExp(`${WB}(let me explain|here's what|the reason|because|first|second|third|step|process|procedure|recommend|suggest|important|note that|keep in mind|اسمح لي|السبب|الخطوة|أوصي|مهم|أولا|أولاً|ثانيا|ثانياً|ثالثا|ثالثاً|لأن)${WBE}`, "i");
const EMPATHY_PATTERNS = new RegExp(`${WB}(understand|i see|that makes sense|of course|no worries|don't worry|i hear you|rest assured|we'll take care|أفهم|لا تقلق|سنهتم|بالطبع|أسمعك|لا تخف)${WBE}`, "i");

function analyzeTextForExpressions(text: string): DIDExpression[] {
  const expressions: DIDExpression[] = [];
  const words = text.split(/\s+/).length;
  const estimatedFrames = Math.max(30, words * 8);

  if (GREETING_PATTERNS.test(text)) {
    expressions.push({ start_frame: 0, expression: "happy", intensity: 0.6 });
  }

  if (CONCERN_PATTERNS.test(text)) {
    const matchIndex = text.search(CONCERN_PATTERNS);
    const relativePosition = matchIndex / text.length;
    const frame = Math.round(relativePosition * estimatedFrames);
    expressions.push({ start_frame: frame, expression: "serious", intensity: 0.5 });

    if (POSITIVE_PATTERNS.test(text.slice(matchIndex))) {
      const laterFrame = Math.min(frame + Math.round(estimatedFrames * 0.3), estimatedFrames - 5);
      expressions.push({ start_frame: laterFrame, expression: "happy", intensity: 0.4 });
    }
  } else if (POSITIVE_PATTERNS.test(text)) {
    const matchIndex = text.search(POSITIVE_PATTERNS);
    const relativePosition = matchIndex / text.length;
    const frame = Math.round(relativePosition * estimatedFrames);
    expressions.push({ start_frame: Math.max(0, frame), expression: "happy", intensity: 0.5 });
  }

  if (QUESTION_PATTERNS.test(text) && !CONCERN_PATTERNS.test(text)) {
    const matchIndex = text.search(QUESTION_PATTERNS);
    const frame = Math.round((matchIndex / text.length) * estimatedFrames);
    expressions.push({ start_frame: frame, expression: "surprise", intensity: 0.25 });
  }

  if (EXPLAIN_PATTERNS.test(text)) {
    const matchIndex = text.search(EXPLAIN_PATTERNS);
    const frame = Math.round((matchIndex / text.length) * estimatedFrames);
    if (!expressions.some(e => Math.abs(e.start_frame - frame) < 10)) {
      expressions.push({ start_frame: frame, expression: "serious", intensity: 0.3 });
    }
  }

  if (EMPATHY_PATTERNS.test(text)) {
    const matchIndex = text.search(EMPATHY_PATTERNS);
    const frame = Math.round((matchIndex / text.length) * estimatedFrames);
    if (!expressions.some(e => Math.abs(e.start_frame - frame) < 10)) {
      expressions.push({ start_frame: frame, expression: "happy", intensity: 0.35 });
    }
  }

  if (expressions.length === 0) {
    expressions.push({ start_frame: 0, expression: "neutral", intensity: 0.3 });
    if (estimatedFrames > 40) {
      expressions.push({ start_frame: Math.round(estimatedFrames * 0.5), expression: "happy", intensity: 0.2 });
    }
  }

  expressions.sort((a, b) => a.start_frame - b.start_frame);

  const deduped: DIDExpression[] = [];
  for (const expr of expressions) {
    if (!deduped.some(e => Math.abs(e.start_frame - expr.start_frame) < 8)) {
      deduped.push(expr);
    }
  }

  return deduped.slice(0, 6);
}

function getMotionFactorForText(text: string): number {
  if (GREETING_PATTERNS.test(text) || POSITIVE_PATTERNS.test(text)) return 0.8;
  if (CONCERN_PATTERNS.test(text)) return 0.65;
  if (EXPLAIN_PATTERNS.test(text)) return 0.7;
  if (QUESTION_PATTERNS.test(text)) return 0.75;
  return 0.7;
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

export async function sendDIDSpeak(agentId: string, streamId: string, sessionId: string, text: string): Promise<void> {
  console.log(`[D-ID] Sending speak: "${text.substring(0, 60)}..."`);

  const expressions = analyzeTextForExpressions(text);
  const motionFactor = getMotionFactorForText(text);

  const enhancedBody = {
    script: { type: "text" as const, input: text, ssml: false },
    config: {
      stitch: true,
      fluent: true,
      align_driver: true,
      sharpen: true,
      auto_match: true,
      normalization_factor: 0.1,
      motion_factor: motionFactor,
      driver_expressions: { expressions },
    },
    session_id: sessionId,
  };

  console.log(`[D-ID] Speak chunk (clip mode): motion=${motionFactor}, expr=${JSON.stringify(expressions.map(e => `${e.expression}@${e.start_frame}`))}`);

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
