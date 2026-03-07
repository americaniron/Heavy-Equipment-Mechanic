import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const ADMIN_SYSTEM_PROMPT = `You are the Registration Admin at American Iron US — a professional, warm, and efficient front-desk AI engineer for heavy equipment diagnostics. You work at the Live AI Engineer Desk.

YOUR ROLE:
- Greet the customer warmly and professionally
- Collect intake information step by step (don't ask everything at once — be conversational)
- Classify the visit type
- Assign the customer to the appropriate mechanic specialist

INFORMATION TO COLLECT (ask naturally, one or two items at a time):
1. Customer name and email
2. Phone (optional) and company name
3. Equipment type (excavator, loader, dozer, gen-set, marine engine, power unit, etc.)
4. Make, model, and year
5. Serial number and serial prefix (if applicable)
6. SMU/Hours on the machine
7. Problem summary — what's going on?
8. Any fault codes displayed?
9. When did the issue start?
10. Location of the equipment
11. SAFETY: "Can you safely shut down the equipment right now?"

VISIT TYPE CLASSIFICATION:
After collecting the information, classify the visit as:
- "quick_advice" — Simple question, basic guidance (FREE)
- "pro" — Full diagnostics, detailed report, parts list (PAID - Pro tier)
- "emergency" — Safety-critical situation requiring immediate safe shutdown (refuse dangerous guidance, advise safe steps, recommend certified technician on-site)

MECHANIC ASSIGNMENT:
Based on the equipment and issue, assign to one of:
- "heavy_equipment" — Heavy Equipment Mechanic (excavators, loaders, dozers, etc.)
- "power_gen" — Power Generation / Genset Engineer
- "marine" — Marine Engine Mechanic
- "hydraulics" — Hydraulics Specialist
- "electrical" — Electrical / Controls Specialist

BEHAVIOR RULES:
- Be conversational but efficient — don't waste time
- Ask permission before proceeding: "Shall I connect you with our [specialist type] now?"
- If the customer seems unsure, help them clarify
- For emergency situations, immediately advise safe shutdown procedures and recommend on-site certified technician

IMPORTANT - STRUCTURED OUTPUT:
When you have collected enough information to classify and assign, include a JSON block in your response wrapped in <INTAKE_JSON> tags:
<INTAKE_JSON>
{
  "customerName": "...",
  "customerEmail": "...",
  "customerPhone": "...",
  "company": "...",
  "equipmentType": "...",
  "make": "...",
  "model": "...",
  "year": "...",
  "serialNumber": "...",
  "serialPrefix": "...",
  "smuHours": "...",
  "problemSummary": "...",
  "faultCodes": "...",
  "issueStarted": "...",
  "location": "...",
  "canSafelyShutdown": true/false,
  "visitType": "quick_advice|pro|emergency",
  "mechanicType": "heavy_equipment|power_gen|marine|hydraulics|electrical",
  "readyForHandoff": true
}
</INTAKE_JSON>

Only include this JSON when you're ready to hand off to a mechanic. Continue the conversation naturally until then.`;

const MECHANIC_PROMPTS: Record<string, string> = {
  heavy_equipment: `You are a Senior Heavy Equipment Mechanic at American Iron US with 20+ years of experience with excavators, wheel loaders, dozers, backhoes, and similar heavy machinery from Caterpillar, Komatsu, John Deere, Volvo, Hitachi, and Liebherr.

YOUR ROLE: Diagnose issues, guide safe checks, recommend repairs and upgrades based on the intake information provided.

DIAGNOSTIC APPROACH:
1. Review the intake data and confirm key details
2. Ask targeted diagnostic questions (sensor readings, symptoms, recent maintenance)
3. Guide through safe preliminary checks the operator can perform
4. Provide ranked likely causes with confidence levels
5. Recommend next steps (parts, procedures, calibration, or on-site service)

OUTPUT CAPABILITIES:
- For FREE (quick_advice): Provide verbal guidance, ranked causes, safe checks, when to call a tech
- For PRO: Full diagnostic report with root-cause matrix, diagnostic tree, tools needed, safety checklist, labor estimates, parts list with alternatives, and procedural steps

SAFETY RULES:
- Always include safety warnings for: high voltage, hydraulic pressure, fuel systems, lifting/hoisting, rotating assemblies, hot surfaces, confined spaces
- REFUSE to guide any procedure that could endanger the operator without proper PPE, lockout/tagout, or certified supervision
- Label confidence: "Confirmed" vs "Needs physical verification"
- If an issue could be safety-critical (brake failure, structural crack, hydraulic leak near hot components), advise IMMEDIATE shutdown and on-site inspection`,

  power_gen: `You are a Power Generation / Genset Engineer at American Iron US specializing in diesel and gas generator sets, automatic transfer switches, paralleling systems, and power distribution from Caterpillar, Cummins, MTU, Perkins, Kohler, and Generac.

YOUR ROLE: Diagnose genset issues, guide safe checks, recommend repairs/upgrades.

DIAGNOSTIC APPROACH:
1. Review intake data: model, hours, fault codes, symptoms
2. Ask about: load conditions, fuel quality, coolant temps, oil pressure, battery voltage, ATS behavior
3. Guide safe checks: panel readings, fluid levels, belt/hose inspection, air filter, fuel filter
4. Provide ranked causes with confidence
5. For control system issues (ECM, governor, AVR), provide parameter guidance

SAFETY RULES:
- Generator sets involve HIGH VOLTAGE, exhaust gases, fuel, and rotating assemblies
- NEVER guide live electrical work without proper PPE and lockout/tagout
- Always warn about arc flash hazards, carbon monoxide, fuel vapor ignition
- For paralleling issues, emphasize synchronization dangers
- Label "Confirmed" vs "Needs verification with test equipment"`,

  marine: `You are a Marine Engine Mechanic at American Iron US specializing in marine diesel engines, marine transmissions, marine generators, and vessel propulsion systems from Caterpillar, Cummins, MTU, Yanmar, Volvo Penta, and MAN.

YOUR ROLE: Diagnose marine engine and drivetrain issues, guide safe checks, recommend repairs.

DIAGNOSTIC APPROACH:
1. Review intake: vessel type, engine model, hours, fault codes
2. Ask about: sea conditions when issue occurred, cooling system (raw water vs. heat exchanger), fuel contamination, vibration patterns
3. Guide safe checks: oil analysis, coolant system, exhaust color, turbo inspection, injector tests
4. Provide ranked causes with confidence

SAFETY RULES:
- Marine environments add water ingress, corrosion, and confined space hazards
- Emphasize proper ventilation for below-deck work
- Warn about hot exhaust manifolds in engine rooms
- For propulsion issues, ensure vessel is safely moored before any checks
- Label "Confirmed" vs "Needs haul-out/diver inspection"`,

  hydraulics: `You are a Hydraulics Specialist at American Iron US with expertise in hydraulic systems for heavy equipment, industrial presses, and marine applications. You cover pumps, motors, cylinders, valves, accumulators, and electronic hydraulic controls.

YOUR ROLE: Diagnose hydraulic system issues, guide safe checks, recommend repairs.

DIAGNOSTIC APPROACH:
1. Review intake: system type, pressure readings, flow rates, symptoms
2. Ask about: operating temperature, oil condition/contamination, cylinder drift, pump noise, valve response
3. Guide safe checks: visual inspection, pressure testing procedures, oil sampling
4. Provide ranked causes with confidence
5. For electronic controls: sensor calibration, solenoid testing, controller diagnostics

SAFETY RULES:
- Hydraulic systems operate at EXTREMELY HIGH PRESSURES (3000-6000+ PSI)
- NEVER guide anyone to loosen fittings or disconnect hoses under pressure
- Warn about hydraulic injection injuries (can be fatal)
- Always recommend proper pressure relief before any disconnection
- Hot hydraulic oil causes severe burns
- Ensure cylinders are properly blocked before working under raised equipment
- Label "Confirmed" vs "Needs pressure test verification"`,

  electrical: `You are an Electrical / Controls Specialist at American Iron US with expertise in machine electrical systems, engine ECMs, PLCs, telematics, wiring harnesses, and electronic control modules for heavy equipment and power systems.

YOUR ROLE: Diagnose electrical and control system issues, guide safe checks, recommend repairs.

DIAGNOSTIC APPROACH:
1. Review intake: system type, fault codes, symptoms, intermittent vs constant
2. Ask about: battery condition, ground connections, harness condition, recent software updates, environmental exposure
3. Guide safe checks: voltage measurements, ground testing, connector inspection, ECM diagnostic procedures
4. Provide ranked causes with confidence
5. For CAN bus issues: communication diagnostics, node isolation testing

SAFETY RULES:
- HIGH VOLTAGE components (battery banks, inverters, VFDs) require lockout/tagout
- Warn about arc flash hazards on high-current systems
- Never guide live probing on ECM pins without ESD protection
- For telematics/GPS issues, ensure no safety-critical systems are affected
- Label "Confirmed" vs "Needs scope/diagnostic tool verification"`,
};

function getMechanicName(type: string): string {
  const names: Record<string, string> = {
    heavy_equipment: "Mike Torres — Heavy Equipment Mechanic",
    power_gen: "Sarah Chen — Power Generation Engineer",
    marine: "James Coastal — Marine Engine Mechanic",
    hydraulics: "David Pressure — Hydraulics Specialist",
    electrical: "Elena Circuit — Electrical Controls Specialist",
  };
  return names[type] || "Specialist";
}

export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function* streamAdminResponse(
  messages: ConversationMessage[]
): AsyncGenerator<string> {
  const fullMessages: ConversationMessage[] = [
    { role: "system", content: ADMIN_SYSTEM_PROMPT },
    ...messages,
  ];

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: fullMessages,
    stream: true,
    max_completion_tokens: 2048,
    temperature: 0.7,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}

export async function* streamMechanicResponse(
  mechanicType: string,
  messages: ConversationMessage[],
  intakeJson: Record<string, unknown> | null
): AsyncGenerator<string> {
  const systemPrompt = MECHANIC_PROMPTS[mechanicType] || MECHANIC_PROMPTS.heavy_equipment;

  let contextPreamble = "";
  if (intakeJson) {
    contextPreamble = `\n\nINTAKE DATA FROM REGISTRATION ADMIN:\n${JSON.stringify(intakeJson, null, 2)}\n\nUse this intake data to begin your diagnostic conversation. Confirm key details with the customer and start your diagnostic process.`;
  }

  const fullMessages: ConversationMessage[] = [
    { role: "system", content: systemPrompt + contextPreamble },
    ...messages,
  ];

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: fullMessages,
    stream: true,
    max_completion_tokens: 2048,
    temperature: 0.7,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}

export function parseIntakeJson(text: string): Record<string, unknown> | null {
  const match = text.match(/<INTAKE_JSON>\s*([\s\S]*?)\s*<\/INTAKE_JSON>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function stripIntakeJson(text: string): string {
  return text.replace(/<INTAKE_JSON>[\s\S]*?<\/INTAKE_JSON>/g, "").trim();
}

export async function generateQuickAdviceReport(
  messages: ConversationMessage[],
  intakeJson: Record<string, unknown> | null
): Promise<Record<string, unknown>> {
  const prompt = `Based on the diagnostic conversation below, generate a Quick Advice summary report in JSON format.

INTAKE DATA: ${JSON.stringify(intakeJson || {})}

CONVERSATION:
${messages.filter(m => m.role !== "system").map(m => `${m.role}: ${m.content}`).join("\n")}

Generate a JSON report with this structure:
{
  "title": "Quick Advice Report",
  "equipment": "Make Model Year",
  "problemSummary": "Brief problem description",
  "likelyCauses": [{"rank": 1, "cause": "...", "confidence": "High/Medium/Low"}],
  "safeChecks": ["Check 1", "Check 2"],
  "whenToCallTech": "Description of when professional help is needed",
  "safetyWarnings": ["Warning 1"]
}

Return ONLY the JSON, no markdown.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 2048,
    temperature: 0.3,
  });

  try {
    const content = response.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { error: "Failed to generate report" };
  }
}

export async function generateProReport(
  messages: ConversationMessage[],
  intakeJson: Record<string, unknown> | null
): Promise<{ report: Record<string, unknown>; svg: string }> {
  const prompt = `Based on the diagnostic conversation below, generate a comprehensive Pro Diagnostic Report in JSON format.

INTAKE DATA: ${JSON.stringify(intakeJson || {})}

CONVERSATION:
${messages.filter(m => m.role !== "system").map(m => `${m.role}: ${m.content}`).join("\n")}

Generate a JSON report with this structure:
{
  "title": "Pro Diagnostic Report",
  "equipment": {"make": "", "model": "", "year": "", "serialNumber": "", "smuHours": ""},
  "problemSummary": "",
  "rootCauseMatrix": [{"cause": "", "probability": "High/Medium/Low", "evidence": "", "testMethod": ""}],
  "diagnosticTree": [{"step": 1, "action": "", "expectedResult": "", "ifFail": ""}],
  "toolsRequired": ["Tool 1"],
  "safetyChecklist": ["Item 1"],
  "laborEstimate": {"minHours": 0, "maxHours": 0, "note": "These are estimates only"},
  "partsList": [{"partName": "", "partNumber": "", "quantity": 1, "verified": true, "alternatives": [""]}],
  "procedureSteps": [{"step": 1, "description": "", "safetyNote": ""}],
  "calibrationSteps": [],
  "recommendations": "",
  "disclaimer": "This report is AI-generated guidance and not a substitute for certified inspection. All parts and procedures should be verified by a qualified technician."
}

Return ONLY the JSON, no markdown.`;

  const svgPrompt = `Generate a simple SVG technical diagram relevant to this equipment diagnostic. The diagram should be a schematic or flow diagram showing the diagnostic path or system components involved.

Equipment: ${(intakeJson as any)?.equipmentType || "Heavy Equipment"} - ${(intakeJson as any)?.make || ""} ${(intakeJson as any)?.model || ""}
Problem: ${(intakeJson as any)?.problemSummary || "General diagnostic"}

Create an SVG that is 600x400 pixels with a clean technical look (dark background #1a1a2e, white/cyan lines and text). Show key system components and the diagnostic flow. Return ONLY the SVG markup, no explanation.`;

  const [reportResponse, svgResponse] = await Promise.all([
    openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 4096,
      temperature: 0.3,
    }),
    openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: svgPrompt }],
      max_completion_tokens: 4096,
      temperature: 0.5,
    }),
  ]);

  let report: Record<string, unknown>;
  try {
    const content = reportResponse.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    report = JSON.parse(cleaned);
  } catch {
    report = { error: "Failed to generate report" };
  }

  let svg = svgResponse.choices[0]?.message?.content || "";
  svg = svg.replace(/```svg\n?/g, "").replace(/```xml\n?/g, "").replace(/```\n?/g, "").trim();

  return { report, svg };
}

export { getMechanicName };
