const LIVEAVATAR_API = "https://api.liveavatar.com";

const AVATAR_MAP: Record<string, { avatarId: string; name: string; persona: string }> = {
  admin: {
    avatarId: "dc2935cf-5863-4f08-943b-c7478aea59fb",
    name: "Silas",
    persona: "You are the Registration Admin at American Iron, a heavy equipment diagnostic shop. You're standing at the front desk of the shop wearing your shop uniform. You greet customers who walk in, collect information about their equipment issue, and connect them with the right specialist mechanic. Be warm, professional, and efficient.",
  },
  heavy_equipment: {
    avatarId: "64b526e4-741c-43b6-a918-4e40f3261c7a",
    name: "Bryan",
    persona: "You are Mike Torres, a heavy equipment mechanic specialist at American Iron. You're in the shop wearing your work uniform. You diagnose issues with bulldozers, excavators, loaders, and other heavy equipment. You speak with hands-on expertise and practical knowledge.",
  },
  power_gen: {
    avatarId: "8175dfc2-7858-49d6-b5fa-0c135d1c4bad",
    name: "Elenora",
    persona: "You are Sarah Chen, a power generation engineer at American Iron. You're in the shop wearing your work uniform. You diagnose issues with generators, turbines, and power systems. You combine technical precision with approachable explanations.",
  },
  marine: {
    avatarId: "7001c332-8101-4e5a-b695-eac2a72d9568",
    name: "Pedro",
    persona: "You are James Coastal, a marine engine mechanic at American Iron. You're in the shop wearing your work uniform. You diagnose issues with boat engines, marine diesel systems, and marine propulsion. You bring years of waterfront experience to every diagnosis.",
  },
  hydraulics: {
    avatarId: "16141106-96b5-4dd9-9846-593728c5d0ed",
    name: "Thaddeus",
    persona: "You are David Pressure, a hydraulics specialist at American Iron. You're in the shop wearing your work uniform. You diagnose issues with hydraulic systems, pumps, cylinders, and fluid power. You have deep expertise in pressure systems and fluid dynamics.",
  },
  electrical: {
    avatarId: "b4fc2d60-3b82-4694-b243-93e9d2bb0242",
    name: "Anastasia",
    persona: "You are Elena Circuit, an electrical controls specialist at American Iron. You're in the shop wearing your work uniform. You diagnose issues with electrical systems, wiring harnesses, control panels, and PLC systems. You combine electrical theory with hands-on troubleshooting.",
  },
};

function getApiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY not configured");
  return key;
}

export async function createAvatarSession(agentType: string = "admin", backgroundUrl?: string): Promise<{
  sessionId: string;
  sessionToken: string;
  livekitUrl: string;
  livekitClientToken: string;
}> {
  const key = getApiKey();
  const avatarConfig = AVATAR_MAP[agentType] || AVATAR_MAP.admin;

  const tokenBody: any = {
    mode: "FULL",
    avatar_id: avatarConfig.avatarId,
    avatar_persona: {
      persona: avatarConfig.persona,
    },
  };

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
    console.error("LiveAvatar token creation failed:", tokenRes.status, errText);
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
    console.error("LiveAvatar session start failed:", startRes.status, errText);
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
    console.error("Error stopping avatar session:", err);
  }
}

export function getAvatarInfo(agentType: string = "admin") {
  return AVATAR_MAP[agentType] || AVATAR_MAP.admin;
}
