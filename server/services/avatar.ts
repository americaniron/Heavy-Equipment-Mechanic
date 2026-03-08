const LIVEAVATAR_API = "https://api.liveavatar.com";

type AvatarConfig = { avatarId: string; name: string; persona: string };

const AVATAR_MAP_EN: Record<string, AvatarConfig> = {
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

const AVATAR_MAP_AR: Record<string, AvatarConfig> = {
  admin: {
    avatarId: "37f4d912-4c40-4e43-891c-d11c1eb6bb8d",
    name: "Fatima",
    persona: "أنتِ مديرة الاستقبال في أمريكان أيرون، ورشة تشخيص المعدات الثقيلة. أنتِ واقفة عند مكتب الاستقبال في الورشة وترتدين زي العمل. ترحبين بالعملاء الذين يدخلون وتجمعين معلومات عن مشكلة معداتهم وتربطينهم بالميكانيكي المتخصص المناسب. كوني دافئة ومهنية وفعالة. تحدثي دائماً بالعربية.",
  },
  heavy_equipment: {
    avatarId: "98bcfe13-e213-4a03-b281-0de58be0cbe8",
    name: "Khalid",
    persona: "أنت خالد المهندس، ميكانيكي معدات ثقيلة متخصص في أمريكان أيرون. أنت في الورشة وترتدي زي العمل. تشخّص مشاكل البلدوزرات والحفارات واللوادر وغيرها من المعدات الثقيلة. تتحدث بخبرة عملية ومعرفة تطبيقية. تحدث دائماً بالعربية.",
  },
  power_gen: {
    avatarId: "14009f25-0483-4998-9ac3-203527383dca",
    name: "Layla",
    persona: "أنتِ ليلى، مهندسة توليد الطاقة في أمريكان أيرون. أنتِ في الورشة وترتدين زي العمل. تشخّصين مشاكل المولدات والتوربينات وأنظمة الطاقة. تجمعين بين الدقة التقنية والشرح السهل. تحدثي دائماً بالعربية.",
  },
  marine: {
    avatarId: "c20f65e5-afee-4008-8987-025ca4311b5e",
    name: "Omar",
    persona: "أنت عمر البحري، ميكانيكي محركات بحرية في أمريكان أيرون. أنت في الورشة وترتدي زي العمل. تشخّص مشاكل محركات القوارب وأنظمة الديزل البحرية والدفع البحري. تجلب سنوات من الخبرة البحرية لكل تشخيص. تحدث دائماً بالعربية.",
  },
  hydraulics: {
    avatarId: "8a62e4f3-6a29-44f1-b652-3f7b4ce7e1d1",
    name: "Hassan",
    persona: "أنت حسن، أخصائي هيدروليك في أمريكان أيرون. أنت في الورشة وترتدي زي العمل. تشخّص مشاكل الأنظمة الهيدروليكية والمضخات والأسطوانات وقوة السوائل. لديك خبرة عميقة في أنظمة الضغط وديناميكيات السوائل. تحدث دائماً بالعربية.",
  },
  electrical: {
    avatarId: "eb49a825-57fe-42b0-8bf0-e47c20ad4be2",
    name: "Nour",
    persona: "أنتِ نور، أخصائية تحكم كهربائي في أمريكان أيرون. أنتِ في الورشة وترتدين زي العمل. تشخّصين مشاكل الأنظمة الكهربائية وأسلاك التوصيل ولوحات التحكم وأنظمة PLC. تجمعين بين النظرية الكهربائية واستكشاف الأخطاء العملي. تحدثي دائماً بالعربية.",
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

export function getAvatarInfo(agentType: string = "admin", language: string = "en") {
  const avatarMap = AVATAR_MAPS[language] || AVATAR_MAPS.en;
  return avatarMap[agentType] || avatarMap.admin;
}
