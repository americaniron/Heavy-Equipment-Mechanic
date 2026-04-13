const LIVEAVATAR_API = "https://api.liveavatar.com";

type AvatarConfig = {
  avatarId: string;
  name: string;
  contextId: string;
  voiceId?: string;
};

const ADMIN_AVATAR_IDS_EN = [
  "073b60a9-89a8-45aa-8902-c358f64d2852", // Katya Sitting
  "26393b8e-e944-4367-98ef-e2bc75c4b792", // Katya in Black Suit
  "bf00036b-558a-44b5-b2ff-1e3cec0f4ceb", // Marianne Sitting
  "998e5637-cfca-4700-891e-8a40ce33f562", // Alessandra Sitting
];

const ADMIN_AVATAR_IDS_AR = [
  "40b4f000-f783-4bba-a327-ea58b1a6fdf2", // Amina Sitting
  "42700a53-38ab-4485-b46f-26be6e0953dc", // Amina in Black Suit
  "bfed3e3e-7d44-4fdb-b2be-ce9a9fd0b9b5", // Amina in Blue Suit
  "bf00036b-558a-44b5-b2ff-1e3cec0f4ceb", // Marianne Sitting
];

function getRandomAdminAvatarId(language: string = "en"): string {
  const pool = language === "ar" ? ADMIN_AVATAR_IDS_AR : ADMIN_AVATAR_IDS_EN;
  return pool[Math.floor(Math.random() * pool.length)];
}

const AVATAR_MAP_EN: Record<string, AvatarConfig> = {
  admin: {
    avatarId: "",
    name: "Sarah",
    contextId: "d6ee6151-e0a0-4c3a-a598-241853641e37",
    voiceId: "864a26b8-bfba-4435-9cc5-1dd593de5ca7",
  },
  heavy_equipment: {
    avatarId: "38ad67ed-98f0-407c-a2d2-4f0998b306fc",
    name: "Mike",
    contextId: "696008fe-4f45-4c86-a18f-11636b246c09",
    voiceId: "c466083f-30f0-465b-a836-0b77abfe7956",
  },
  power_gen: {
    avatarId: "0aae6046-0ab9-44fe-a08d-c5ac3f406d34",
    name: "Sarah C.",
    contextId: "b9c79e29-9184-4a8a-a3c3-9b848267976e",
    voiceId: "b2bd6569-a537-4342-aeca-a1f15d2a2c97",
  },
  marine: {
    avatarId: "200eba85-74c0-4210-8670-81ceab4efd0d",
    name: "James",
    contextId: "46e8c762-c0c5-4770-af10-a2232373cad2",
    voiceId: "98a984cd-5f25-49b1-8844-2195c3d50e0f",
  },
  hydraulics: {
    avatarId: "246e8d9d-5826-4f49-b8a0-07cb73ff7556",
    name: "David",
    contextId: "ba83f0c7-badc-4657-9803-b3f2a3801787",
    voiceId: "83a26e3f-bcff-4887-80a2-17531c342c9e",
  },
  electrical: {
    avatarId: "ebdfdc7e-7e2c-4d2c-8407-a78883e5000a",
    name: "Elena",
    contextId: "a8b7be49-abe6-4760-820a-bcdffcf49706",
    voiceId: "3607df3c-9de0-4274-b0be-7e035775ead5",
  },
  parts: {
    avatarId: "03f8332d-9046-42a1-bff3-3b2309f77b58",
    name: "Marcus",
    contextId: "c684a5d2-49e6-4647-a8db-f3af5a84e2ce",
    voiceId: "e04e9d57-853f-4d72-a8ff-8e3c768f4c9c",
  },
};

const AVATAR_MAP_AR: Record<string, AvatarConfig> = {
  admin: {
    avatarId: "",
    name: "فاطمة",
    contextId: "49b7ecaa-84c4-4043-a8b4-e11a040d7b0c",
    voiceId: "c84af063-5ce2-4370-8ef8-dcd0ef903d43",
  },
  heavy_equipment: {
    avatarId: "0930fd59-c8ad-434d-ad53-b391a1768720",
    name: "خالد",
    contextId: "ca03a8b1-5f0c-45cf-97d9-34c3bd872702",
    voiceId: "b952f553-f7f3-4e52-8625-86b4c415384f",
  },
  power_gen: {
    avatarId: "0f563214-1cb5-4dc0-a2f9-43f44e5e6b57",
    name: "ليلى",
    contextId: "6fc8caea-75c8-46de-b6ff-c14b9958716c",
    voiceId: "4f3b1e99-b580-4f05-9b67-a5f585be0232",
  },
  marine: {
    avatarId: "7b888024-f8c9-4205-95e1-78ce01497bda",
    name: "عمر",
    contextId: "c67dca7a-9d07-4618-9fdb-98e486ecdced",
    voiceId: "51afbab6-7af4-473b-95fc-6ce26aac8bb1",
  },
  hydraulics: {
    avatarId: "509609b9-cda3-4f74-b1b2-97b4d98834fd",
    name: "حسن",
    contextId: "084a06bb-b839-4e9e-8975-22ca94002e61",
    voiceId: "c466083f-30f0-465b-a836-0b77abfe7956",
  },
  electrical: {
    avatarId: "9c59a215-4c9f-478f-9d95-edca74c7b0d0",
    name: "نور",
    contextId: "856887c6-4c08-4430-9c4a-6454efe2d0ff",
    voiceId: "c84af063-5ce2-4370-8ef8-dcd0ef903d43",
  },
  parts: {
    avatarId: "dc2935cf-5863-4f08-943b-c7478aea59fb",
    name: "طارق",
    contextId: "28bde410-238e-45c8-945e-67d873867657",
    voiceId: "b139a8fe-7240-4454-ac37-8c68aebcee41",
  },
};

const AVATAR_MAPS: Record<string, Record<string, AvatarConfig>> = {
  en: AVATAR_MAP_EN,
  ar: AVATAR_MAP_AR,
};

function getApiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY not configured");
  return key;
}

export async function createAvatarSession(agentType: string = "admin", backgroundUrl?: string, language: string = "en"): Promise<{
  sessionId: string;
  sessionToken: string;
  livekitUrl: string;
  livekitClientToken: string;
}> {
  const key = getApiKey();
  const avatarMap = AVATAR_MAPS[language] || AVATAR_MAPS.en;
  const avatarConfig = avatarMap[agentType] || avatarMap.admin;

  const avatarId = agentType === "admin" ? getRandomAdminAvatarId(language) : avatarConfig.avatarId;
  console.log(`[LiveAvatar] Using avatar: ${avatarConfig.name} (${avatarId}) for ${agentType}/${language}, context: ${avatarConfig.contextId}`);

  const tokenBody: any = {
    mode: "FULL",
    avatar_id: avatarId,
    avatar_persona: {
      context_id: avatarConfig.contextId,
      language: language === "ar" ? "ar" : "en",
    },
    video_settings: {
      quality: "high",
      encoding: "H264",
    },
  };

  if (avatarConfig.voiceId) {
    tokenBody.avatar_persona.voice_id = avatarConfig.voiceId;
  }

  if (backgroundUrl) {
    tokenBody.background = {
      type: "image",
      value: backgroundUrl,
    };
  }

  const tokenRes = await fetch(`${LIVEAVATAR_API}/v1/sessions/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify(tokenBody),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[LiveAvatar] Token creation failed:", tokenRes.status, errText);
    throw new Error(`LiveAvatar token error: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  const sessionToken = tokenData.data.session_token;
  const sessionId = tokenData.data.session_id;

  const startRes = await fetch(`${LIVEAVATAR_API}/v1/sessions/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!startRes.ok) {
    const errText = await startRes.text();
    console.error("[LiveAvatar] Session start failed:", startRes.status, errText);
    throw new Error(`LiveAvatar start error: ${startRes.status}`);
  }

  const startData = await startRes.json();

  return {
    sessionId: startData.data.session_id,
    sessionToken,
    livekitUrl: startData.data.livekit_url,
    livekitClientToken: startData.data.livekit_client_token,
  };
}

export async function sendAvatarSpeak(sessionToken: string, text: string): Promise<void> {
  const res = await fetch(`${LIVEAVATAR_API}/v1/sessions/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ text, task_type: "talk" }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[LiveAvatar] Speak failed:", res.status, errText);
    throw new Error(`LiveAvatar speak error: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  console.log("[LiveAvatar] Speak task sent:", data?.data?.task_id || "ok");
}

export async function stopAvatarSession(sessionToken: string): Promise<void> {
  try {
    await fetch(`${LIVEAVATAR_API}/v1/sessions/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    console.error("[LiveAvatar] Error stopping session:", err);
  }
}

export function getAvatarInfo(agentType: string = "admin", language: string = "en") {
  const avatarMap = AVATAR_MAPS[language] || AVATAR_MAPS.en;
  return avatarMap[agentType] || avatarMap.admin;
}

export async function listAvailableAvatars(): Promise<Array<{ id: string; name: string; voiceName: string }>> {
  const key = getApiKey();
  const allAvatars: Array<{ id: string; name: string; voiceName: string }> = [];
  let page = 1;

  while (true) {
    const res = await fetch(`${LIVEAVATAR_API}/v1/avatars/public?page=${page}&page_size=50`, {
      headers: { "Accept": "application/json", "x-api-key": key },
    });
    const data = await res.json();
    if (!data.data?.results?.length) break;

    for (const a of data.data.results) {
      allAvatars.push({
        id: a.id,
        name: a.name,
        voiceName: a.default_voice?.name || "unknown",
      });
    }

    if (!data.data.next) break;
    page++;
  }

  return allAvatars;
}
