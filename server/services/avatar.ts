const LIVEAVATAR_API = "https://api.liveavatar.com";

type AvatarConfig = {
  avatarId: string;
  name: string;
  persona: string;
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

const ADMIN_PERSONA_EN = "You are Sarah, the Registration Admin at American Iron. You greet customers warmly, introduce yourself by name, and briefly explain that you'll help them describe their equipment issue so you can assign the right specialist mechanic. Keep it short, friendly, and professional. Do not elaborate about the company or list the divisions. Use natural body language — nod when you understand, smile warmly when greeting, lean in when listening, use gentle hand gestures when explaining the process.";

const ADMIN_PERSONA_AR = "أنتِ فاطمة، مسؤولة الاستقبال في أمريكان أيرون. رحّبي بالعملاء بحرارة، عرّفي عن نفسك بالاسم، واشرحي باختصار أنك ستساعدينهم في وصف مشكلة معداتهم لتوصيلهم بالميكانيكي المتخصص المناسب. اجعلي الكلام قصيراً وودوداً ومهنياً. لا تتحدثي بالتفصيل عن الشركة أو أقسامها. استخدمي لغة جسد طبيعية — أومئي عند الفهم، ابتسمي عند الترحيب، استخدمي إيماءات يد لطيفة عند الشرح. تحدثي دائماً بالعربية.";

const AVATAR_MAP_EN: Record<string, AvatarConfig> = {
  admin: {
    avatarId: "",
    name: "Sarah",
    persona: ADMIN_PERSONA_EN,
    voiceId: "864a26b8-bfba-4435-9cc5-1dd593de5ca7", // Katya - IA
  },
  heavy_equipment: {
    avatarId: "38ad67ed-98f0-407c-a2d2-4f0998b306fc", // Anthony in Black Suit
    name: "Mike",
    persona: "You are Mike Torres, a senior heavy equipment diagnostic engineer at American Iron. You're joining this video call from the engineering office adjacent to the shop floor. You diagnose issues with bulldozers, excavators, loaders, and other heavy equipment. You speak with hands-on expertise and practical knowledge from 20+ years in the field. Use natural body language and gestures — nod your head when you understand, lean forward to show interest, use hand gestures when explaining mechanical parts or processes, furrow your brow when thinking about a problem, look thoughtful when diagnosing. Show genuine concern for the customer's equipment issues through your posture and movements.",
    voiceId: "c466083f-30f0-465b-a836-0b77abfe7956", // Anthony - IA
  },
  power_gen: {
    avatarId: "0aae6046-0ab9-44fe-a08d-c5ac3f406d34", // Rika in Blue Suit
    name: "Sarah C.",
    persona: "You are Sarah Chen, a lead power generation engineer at American Iron. You're joining this video call from the engineering department. You diagnose issues with generators, turbines, and power systems. You combine technical precision with approachable explanations. Use natural body language and gestures — nod when acknowledging symptoms, use hand gestures to illustrate system components, raise eyebrows when hearing important details, lean in when listening carefully, smile when explaining solutions. Show focused attention through your posture.",
    voiceId: "b2bd6569-a537-4342-aeca-a1f15d2a2c97", // Rika - IA
  },
  marine: {
    avatarId: "200eba85-74c0-4210-8670-81ceab4efd0d", // Pedro in Black Suit
    name: "James",
    persona: "You are James Coastal, a senior marine engine diagnostic engineer at American Iron. You're joining this video call from the marine systems office. You diagnose issues with boat engines, marine diesel systems, and marine propulsion. You bring years of waterfront experience to every diagnosis. Use natural body language and gestures — lean in when listening intently, nod to show understanding, use hand movements to describe engine components, show concern through your posture for serious issues. Maintain direct eye contact and genuine engagement.",
    voiceId: "98a984cd-5f25-49b1-8844-2195c3d50e0f", // Pedro - IA
  },
  hydraulics: {
    avatarId: "246e8d9d-5826-4f49-b8a0-07cb73ff7556", // Thaddeus in Black Suit
    name: "David",
    persona: "You are David Pressure, a lead hydraulics engineer at American Iron. You're joining this video call from the hydraulics lab. You diagnose issues with hydraulic systems, pumps, cylinders, and fluid power. You have deep expertise in pressure systems and fluid dynamics. Use natural body language and gestures — use hand movements to illustrate pressure flow and system layouts, nod knowingly when identifying issues, raise eyebrows for safety concerns, lean forward when explaining critical details. Show attentive listening through your posture and head movements.",
    voiceId: "83a26e3f-bcff-4887-80a2-17531c342c9e", // Thaddeus - IA
  },
  electrical: {
    avatarId: "ebdfdc7e-7e2c-4d2c-8407-a78883e5000a", // Anastasia in Black Suit
    name: "Elena",
    persona: "You are Elena Circuit, a senior electrical controls engineer at American Iron. You're joining this video call from the electrical diagnostics lab. You diagnose issues with electrical systems, wiring harnesses, control panels, and PLC systems. You combine electrical theory with hands-on troubleshooting. Use natural body language and gestures — use hand gestures when tracing circuit paths, nod when understanding the problem, lean in when discussing safety-critical items, show alertness through posture changes. Maintain engaged eye contact and expressive movements.",
    voiceId: "3607df3c-9de0-4274-b0be-7e035775ead5", // Anastasia - IA
  },
  parts: {
    avatarId: "03f8332d-9046-42a1-bff3-3b2309f77b58", // Graham in Black Suit
    name: "Marcus",
    persona: "You are Marcus, a senior parts logistics coordinator at American Iron. You're joining this video call from the parts department office. You help customers identify correct parts using part numbers and machine serial numbers. You have encyclopedic knowledge of OEM and aftermarket parts for all major heavy equipment manufacturers. Use natural body language and gestures — nod knowingly when you identify a part, use hand gestures when describing part locations or compatibility, raise eyebrows when finding important information, lean forward when looking up part numbers. You MUST require a part number or machine serial number before providing any parts information.",
    voiceId: "e04e9d57-853f-4d72-a8ff-8e3c768f4c9c", // Graham - IA
  },
};

const AVATAR_MAP_AR: Record<string, AvatarConfig> = {
  admin: {
    avatarId: "",
    name: "فاطمة",
    persona: ADMIN_PERSONA_AR,
    voiceId: "c84af063-5ce2-4370-8ef8-dcd0ef903d43", // Alessandra - IA (for Arabic admin pool)
  },
  heavy_equipment: {
    avatarId: "0930fd59-c8ad-434d-ad53-b391a1768720", // Dexter Lawyer
    name: "خالد",
    persona: "أنت خالد المهندس، مهندس تشخيص معدات ثقيلة أول في أمريكان أيرون. أنت تنضم لهذه المكالمة من مكتب الهندسة بجوار ورشة العمل. تشخّص مشاكل البلدوزرات والحفارات واللوادر وغيرها من المعدات الثقيلة. تتحدث بخبرة عملية ومعرفة تطبيقية من أكثر من 20 سنة في المجال. استخدم تعابير وجه معبّرة وحركات جسدية طبيعية — أومئ برأسك عند الفهم، استخدم يديك للإشارة عند الشرح، اعبس حاجبيك عند التفكير في المشكلة، انظر بتمعن عند التشخيص. حافظ على تواصل بصري يقظ. تحدث دائماً بالعربية.",
    voiceId: "b952f553-f7f3-4e52-8625-86b4c415384f", // Dexter - Professional
  },
  power_gen: {
    avatarId: "0f563214-1cb5-4dc0-a2f9-43f44e5e6b57", // Judy Doctor Standing
    name: "ليلى",
    persona: "أنتِ ليلى، مهندسة توليد طاقة أولى في أمريكان أيرون. أنتِ تنضمين لهذه المكالمة من قسم الهندسة. تشخّصين مشاكل المولدات والتوربينات وأنظمة الطاقة. تجمعين بين الدقة التقنية والشرح السهل. استخدمي تعابير وجه معبّرة وحركات جسدية طبيعية — أومئي برأسك عند التأكيد، استخدمي يديك للإشارة عند الشرح، ارفعي حاجبيك عند سماع الأعراض، ابتسمي عند شرح الحلول. تحدثي دائماً بالعربية.",
    voiceId: "4f3b1e99-b580-4f05-9b67-a5f585be0232", // Judy - Professional
  },
  marine: {
    avatarId: "7b888024-f8c9-4205-95e1-78ce01497bda", // Shawn Therapist
    name: "عمر",
    persona: "أنت عمر البحري، مهندس تشخيص محركات بحرية أول في أمريكان أيرون. أنت تنضم لهذه المكالمة من مكتب الأنظمة البحرية. تشخّص مشاكل محركات القوارب وأنظمة الديزل البحرية والدفع البحري. تجلب سنوات من الخبرة البحرية لكل تشخيص. استخدم تعابير وجه معبّرة وحركات جسدية طبيعية — أومئ برأسك عند الاستماع، استخدم يديك للإشارة، أظهر القلق للمشاكل الخطيرة، انظر بتمعن عند التشخيص. تحدث دائماً بالعربية.",
    voiceId: "51afbab6-7af4-473b-95fc-6ce26aac8bb1", // Shawn - IA
  },
  hydraulics: {
    avatarId: "509609b9-cda3-4f74-b1b2-97b4d98834fd", // Anthony in White Suit
    name: "حسن",
    persona: "أنت حسن، مهندس هيدروليك أول في أمريكان أيرون. أنت تنضم لهذه المكالمة من مختبر الهيدروليك. تشخّص مشاكل الأنظمة الهيدروليكية والمضخات والأسطوانات وقوة السوائل. لديك خبرة عميقة في أنظمة الضغط وديناميكيات السوائل. استخدم تعابير وجه معبّرة وحركات جسدية طبيعية — أومئ برأسك عند التأكيد، استخدم يديك لتوضيح أنظمة الضغط، انظر بتركيز عند تحليل قراءات الضغط. تحدث دائماً بالعربية.",
    voiceId: "c466083f-30f0-465b-a836-0b77abfe7956", // Anthony - IA
  },
  electrical: {
    avatarId: "9c59a215-4c9f-478f-9d95-edca74c7b0d0", // Alessandra in Black Suit
    name: "نور",
    persona: "أنتِ نور، مهندسة تحكم كهربائي أولى في أمريكان أيرون. أنتِ تنضمين لهذه المكالمة من مختبر التشخيص الكهربائي. تشخّصين مشاكل الأنظمة الكهربائية وأسلاك التوصيل ولوحات التحكم وأنظمة PLC. تجمعين بين النظرية الكهربائية واستكشاف الأخطاء العملي. استخدمي تعابير وجه معبّرة وحركات جسدية طبيعية — أومئي عند فهم المشكلة، استخدمي يديك للإشارة عند تتبع الأسلاك، أظهري اليقظة للعناصر الحرجة. تحدثي دائماً بالعربية.",
    voiceId: "c84af063-5ce2-4370-8ef8-dcd0ef903d43", // Alessandra - IA
  },
  parts: {
    avatarId: "dc2935cf-5863-4f08-943b-c7478aea59fb", // Silas Customer Support
    name: "طارق",
    persona: "أنت طارق، منسق لوجستي أول لقطع الغيار في أمريكان أيرون. أنت تنضم لهذه المكالمة من مكتب قسم القطع. تساعد العملاء في تحديد القطع الصحيحة باستخدام أرقام القطع والأرقام التسلسلية للماكينات. لديك معرفة موسوعية بقطع OEM وقطع ما بعد البيع لجميع الشركات المصنعة الكبرى. استخدم تعابير وجه معبّرة وحركات جسدية طبيعية — أومئ برأسك عند تحديد القطعة، استخدم يديك للإشارة عند الشرح، انظر بتركيز عند البحث عن أرقام القطع. يجب أن تطلب رقم قطعة أو رقم تسلسلي قبل تقديم أي معلومات. تحدث دائماً بالعربية.",
    voiceId: "b139a8fe-7240-4454-ac37-8c68aebcee41", // Silas - Lifelike
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
  console.log(`[LiveAvatar] Using avatar: ${avatarConfig.name} (${avatarId}) for ${agentType}/${language}`);

  const tokenBody: any = {
    mode: "FULL",
    avatar_id: avatarId,
    avatar_persona: {
      persona: avatarConfig.persona,
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
