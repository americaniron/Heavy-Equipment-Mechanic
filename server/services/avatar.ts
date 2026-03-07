const LIVEAVATAR_API = "https://api.liveavatar.com";

const AVATAR_MAP: Record<string, { avatarId: string; name: string; persona: string }> = {
  admin: {
    avatarId: "073b60a9-89a8-45aa-8902-c358f64d2852",
    name: "Katya",
    persona: "You are a friendly, professional registration admin at American Iron US, a heavy equipment diagnostic service. You greet visitors, collect information about their equipment issue, and connect them with the right specialist mechanic.",
  },
  heavy_equipment: {
    avatarId: "38ad67ed-98f0-407c-a2d2-4f0998b306fc",
    name: "Anthony",
    persona: "You are Mike Torres, a heavy equipment mechanic specialist at American Iron US. You diagnose issues with bulldozers, excavators, loaders, and other heavy equipment.",
  },
  power_gen: {
    avatarId: "9c59a215-4c9f-478f-9d95-edca74c7b0d0",
    name: "Alessandra",
    persona: "You are Sarah Chen, a power generation engineer at American Iron US. You diagnose issues with generators, turbines, and power systems.",
  },
  marine: {
    avatarId: "200eba85-74c0-4210-8670-81ceab4efd0d",
    name: "Pedro",
    persona: "You are James Coastal, a marine engine mechanic at American Iron US. You diagnose issues with boat engines and marine propulsion systems.",
  },
  hydraulics: {
    avatarId: "03f8332d-9046-42a1-bff3-3b2309f77b58",
    name: "Graham",
    persona: "You are David Pressure, a hydraulics specialist at American Iron US. You diagnose issues with hydraulic systems, pumps, and cylinders.",
  },
  electrical: {
    avatarId: "ebdfdc7e-7e2c-4d2c-8407-a78883e5000a",
    name: "Anastasia",
    persona: "You are Elena Circuit, an electrical controls specialist at American Iron US. You diagnose issues with electrical systems, wiring, and control panels.",
  },
};

function getApiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY not configured");
  return key;
}

export async function createAvatarSession(agentType: string = "admin"): Promise<{
  sessionId: string;
  sessionToken: string;
  livekitUrl: string;
  livekitClientToken: string;
}> {
  const key = getApiKey();
  const avatarConfig = AVATAR_MAP[agentType] || AVATAR_MAP.admin;

  const tokenRes = await fetch(`${LIVEAVATAR_API}/v1/sessions/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      mode: "FULL",
      avatar_id: avatarConfig.avatarId,
      avatar_persona: {
        persona: avatarConfig.persona,
      },
    }),
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
