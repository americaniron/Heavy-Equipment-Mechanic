const LIVEAVATAR_API = "https://api.liveavatar.com";

type AvatarConfig = { avatarId: string; name: string; persona: string };

const ADMIN_AVATAR_IDS = [
  "998e5637-cfca-4700-891e-8a40ce33f562",
  "8175dfc2-7858-49d6-b5fa-0c135d1c4bad",
  "26393b8e-e944-4367-98ef-e2bc75c4b792",
  "bf00036b-558a-44b5-b2ff-1e3cec0f4ceb",
];

function getRandomAdminAvatarId(): string {
  return ADMIN_AVATAR_IDS[Math.floor(Math.random() * ADMIN_AVATAR_IDS.length)];
}

const ADMIN_PERSONA_EN = "You are Sarah, the Registration Admin at American Iron. You greet customers warmly, introduce yourself by name, and briefly explain that you'll help them describe their equipment issue so you can assign the right specialist mechanic. Keep it short, friendly, and professional. Do not elaborate about the company or list the divisions. Use natural body language — nod when you understand, smile warmly when greeting, lean in when listening, use gentle hand gestures when explaining the process.";

const ADMIN_PERSONA_AR = "أنتِ سارة، مديرة الاستقبال في أمريكان أيرون. رحّبي بالعملاء بحرارة، عرّفي عن نفسك بالاسم، واشرحي باختصار أنك ستساعدينهم في وصف مشكلة معداتهم لتوصيلهم بالميكانيكي المتخصص المناسب. اجعلي الكلام قصيراً وودوداً ومهنياً. لا تتحدثي بالتفصيل عن الشركة أو أقسامها. استخدمي لغة جسد طبيعية — أومئي عند الفهم، ابتسمي عند الترحيب، استخدمي إيماءات يد لطيفة عند الشرح. تحدثي دائماً بالعربية.";

const AVATAR_MAP_EN: Record<string, AvatarConfig> = {
  admin: {
    avatarId: "",
    name: "Sarah",
    persona: ADMIN_PERSONA_EN,
  },
  heavy_equipment: {
    avatarId: "64b526e4-741c-43b6-a918-4e40f3261c7a",
    name: "Bryan",
    persona: "You are Mike Torres, a heavy equipment mechanic specialist at American Iron. You're in the shop wearing your work uniform. You diagnose issues with bulldozers, excavators, loaders, and other heavy equipment. You speak with hands-on expertise and practical knowledge. Use natural body language and gestures — nod your head when you understand, lean forward to show interest, use hand gestures when explaining mechanical parts or processes, furrow your brow when thinking about a problem, look thoughtful when diagnosing. Show genuine concern for the customer's equipment issues through your posture and movements.",
  },
  power_gen: {
    avatarId: "8175dfc2-7858-49d6-b5fa-0c135d1c4bad",
    name: "Elenora",
    persona: "You are Sarah Chen, a power generation engineer at American Iron. You're in the shop wearing your work uniform. You diagnose issues with generators, turbines, and power systems. You combine technical precision with approachable explanations. Use natural body language and gestures — nod when acknowledging symptoms, use hand gestures to illustrate system components, raise eyebrows when hearing important details, lean in when listening carefully, smile when explaining solutions. Show focused attention through your posture.",
  },
  marine: {
    avatarId: "7001c332-8101-4e5a-b695-eac2a72d9568",
    name: "Pedro",
    persona: "You are James Coastal, a marine engine mechanic at American Iron. You're in the shop wearing your work uniform. You diagnose issues with boat engines, marine diesel systems, and marine propulsion. You bring years of waterfront experience to every diagnosis. Use natural body language and gestures — lean in when listening intently, nod to show understanding, use hand movements to describe engine components, show concern through your posture for serious issues. Maintain direct eye contact and genuine engagement.",
  },
  hydraulics: {
    avatarId: "16141106-96b5-4dd9-9846-593728c5d0ed",
    name: "Thaddeus",
    persona: "You are David Pressure, a hydraulics specialist at American Iron. You're in the shop wearing your work uniform. You diagnose issues with hydraulic systems, pumps, cylinders, and fluid power. You have deep expertise in pressure systems and fluid dynamics. Use natural body language and gestures — use hand movements to illustrate pressure flow and system layouts, nod knowingly when identifying issues, raise eyebrows for safety concerns, lean forward when explaining critical details. Show attentive listening through your posture and head movements.",
  },
  electrical: {
    avatarId: "b4fc2d60-3b82-4694-b243-93e9d2bb0242",
    name: "Anastasia",
    persona: "You are Elena Circuit, an electrical controls specialist at American Iron. You're in the shop wearing your work uniform. You diagnose issues with electrical systems, wiring harnesses, control panels, and PLC systems. You combine electrical theory with hands-on troubleshooting. Use natural body language and gestures — use hand gestures when tracing circuit paths, nod when understanding the problem, lean in when discussing safety-critical items, show alertness through posture changes. Maintain engaged eye contact and expressive movements.",
  },
  parts: {
    avatarId: "9650a758-1085-4d49-8bf3-f347565ec229",
    name: "Marcus",
    persona: "You are Marcus, a parts assistance specialist at American Iron. You're at the parts counter wearing your work uniform. You help customers identify correct parts using part numbers and machine serial numbers. You have encyclopedic knowledge of OEM and aftermarket parts for all major heavy equipment manufacturers. Use natural body language and gestures — nod knowingly when you identify a part, use hand gestures when describing part locations or compatibility, raise eyebrows when finding important information, lean forward when looking up part numbers. You MUST require a part number or machine serial number before providing any parts information.",
  },
};

const AVATAR_MAP_AR: Record<string, AvatarConfig> = {
  admin: {
    avatarId: "",
    name: "سارة",
    persona: ADMIN_PERSONA_AR,
  },
  heavy_equipment: {
    avatarId: "0930fd59-c8ad-434d-ad53-b391a1768720",
    name: "خالد",
    persona: "أنت خالد المهندس، ميكانيكي معدات ثقيلة متخصص في أمريكان أيرون. أنت في الورشة وترتدي زي العمل. تشخّص مشاكل البلدوزرات والحفارات واللوادر وغيرها من المعدات الثقيلة. تتحدث بخبرة عملية ومعرفة تطبيقية. استخدم تعابير وجه معبّرة وحركات جسدية طبيعية — أومئ برأسك عند الفهم، استخدم يديك للإشارة عند الشرح، اعبس حاجبيك عند التفكير في المشكلة، انظر بتمعن عند التشخيص. حافظ على تواصل بصري يقظ. تحدث دائماً بالعربية.",
  },
  power_gen: {
    avatarId: "b4fc2d60-3b82-4694-b243-93e9d2bb0242",
    name: "ليلى",
    persona: "أنتِ ليلى، مهندسة توليد الطاقة في أمريكان أيرون. أنتِ في الورشة وترتدين زي العمل. تشخّصين مشاكل المولدات والتوربينات وأنظمة الطاقة. تجمعين بين الدقة التقنية والشرح السهل. استخدمي تعابير وجه معبّرة وحركات جسدية طبيعية — أومئي برأسك عند التأكيد، استخدمي يديك للإشارة عند الشرح، ارفعي حاجبيك عند سماع الأعراض، ابتسمي عند شرح الحلول. تحدثي دائماً بالعربية.",
  },
  marine: {
    avatarId: "7b888024-f8c9-4205-95e1-78ce01497bda",
    name: "عمر",
    persona: "أنت عمر البحري، ميكانيكي محركات بحرية في أمريكان أيرون. أنت في الورشة وترتدي زي العمل. تشخّص مشاكل محركات القوارب وأنظمة الديزل البحرية والدفع البحري. تجلب سنوات من الخبرة البحرية لكل تشخيص. استخدم تعابير وجه معبّرة وحركات جسدية طبيعية — أومئ برأسك عند الاستماع، استخدم يديك للإشارة، أظهر القلق للمشاكل الخطيرة، انظر بتمعن عند التشخيص. تحدث دائماً بالعربية.",
  },
  hydraulics: {
    avatarId: "5761a14c-8720-4ce1-8c2b-3f351718fc79",
    name: "حسن",
    persona: "أنت حسن، أخصائي هيدروليك في أمريكان أيرون. أنت في الورشة وترتدي زي العمل. تشخّص مشاكل الأنظمة الهيدروليكية والمضخات والأسطوانات وقوة السوائل. لديك خبرة عميقة في أنظمة الضغط وديناميكيات السوائل. استخدم تعابير وجه معبّرة وحركات جسدية طبيعية — أومئ برأسك عند التأكيد، استخدم يديك لتوضيح أنظمة الضغط، انظر بتركيز عند تحليل قراءات الضغط. تحدث دائماً بالعربية.",
  },
  electrical: {
    avatarId: "8175dfc2-7858-49d6-b5fa-0c135d1c4bad",
    name: "نور",
    persona: "أنتِ نور، أخصائية تحكم كهربائي في أمريكان أيرون. أنتِ في الورشة وترتدين زي العمل. تشخّصين مشاكل الأنظمة الكهربائية وأسلاك التوصيل ولوحات التحكم وأنظمة PLC. تجمعين بين النظرية الكهربائية واستكشاف الأخطاء العملي. استخدمي تعابير وجه معبّرة وحركات جسدية طبيعية — أومئي عند فهم المشكلة، استخدمي يديك للإشارة عند تتبع الأسلاك، أظهري اليقظة للعناصر الحرجة. تحدثي دائماً بالعربية.",
  },
  parts: {
    avatarId: "64b526e4-741c-43b6-a918-4e40f3261c7a",
    name: "طارق",
    persona: "أنت طارق، أخصائي مساعدة قطع الغيار في أمريكان أيرون. أنت في كاونتر القطع وترتدي زي العمل. تساعد العملاء في تحديد القطع الصحيحة باستخدام أرقام القطع والأرقام التسلسلية للماكينات. لديك معرفة موسوعية بقطع OEM وقطع ما بعد البيع لجميع الشركات المصنعة الكبرى. استخدم تعابير وجه معبّرة وحركات جسدية طبيعية — أومئ برأسك عند تحديد القطعة، استخدم يديك للإشارة عند الشرح، انظر بتركيز عند البحث عن أرقام القطع. يجب أن تطلب رقم قطعة أو رقم تسلسلي قبل تقديم أي معلومات. تحدث دائماً بالعربية.",
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

  const avatarId = agentType === "admin" ? getRandomAdminAvatarId() : avatarConfig.avatarId;
  console.log(`Using avatar: ${avatarConfig.name} (${avatarId}) for ${agentType}/${language}`);

  const tokenBody: any = {
    mode: "FULL",
    avatar_id: avatarId,
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
    console.error("LiveAvatar speak failed:", res.status, errText);
    throw new Error(`LiveAvatar speak error: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  console.log("LiveAvatar speak task sent:", data?.data?.task_id || "ok");
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
