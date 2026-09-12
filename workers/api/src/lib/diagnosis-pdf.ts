import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Workers-runtime PDF generation for diagnosis reports.
 *
 * pdf-lib is pure-JS and runs under workerd. We only use the built-in
 * StandardFonts (Helvetica family) so no fontkit/WASM embedding is needed.
 */

export interface PossibleCause {
  cause: string;
  likelihood?: string;
  reasoning?: string;
}

export interface DiagnosticTest {
  test: string;
  tools?: string[];
  expected_reading_pass?: string;
  expected_reading_fail?: string;
}

export interface PartLikelyNeeded {
  part_number?: string;
  description?: string;
  why?: string;
}

export interface DiagnosisPdfData {
  sessionId: string;
  machineMake?: string | null;
  machineModel?: string | null;
  machineYear?: string | number | null;
  machineHours?: string | number | null;
  symptoms?: string | null;
  faultCodes: string[];
  recentService: string[];
  operatorNotes?: string | null;
  modelUsed?: string | null;
  generatedAt?: string | null;
  possibleCauses: PossibleCause[];
  testsInOrder: DiagnosticTest[];
  expectedReadings: Record<string, string>;
  partsLikelyNeeded: PartLikelyNeeded[];
  safetyWarnings: string[];
}

const PAGE_WIDTH = 612; // US Letter, 72dpi
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.11, 0.12, 0.14);
const MUTED = rgb(0.38, 0.4, 0.44);
const ACCENT = rgb(0.72, 0.31, 0.06);
const WARN = rgb(0.66, 0.11, 0.11);
const RULE = rgb(0.82, 0.83, 0.85);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

class Cursor {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    private fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensureSpace(needed: number) {
    if (this.y - needed < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const rawLine of String(text).split("\n")) {
      const words = rawLine.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push("");
        continue;
      }
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }

  text(
    content: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      gap?: number;
      lineGap?: number;
    } = {},
  ) {
    const size = opts.size ?? 11;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const color = opts.color ?? INK;
    const indent = opts.indent ?? 0;
    const lineHeight = size + (opts.lineGap ?? 4);
    const lines = this.wrap(content, font, size, CONTENT_WIDTH - indent);
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font,
        color,
      });
    }
    this.y -= opts.gap ?? 0;
  }

  rule(gap = 8) {
    this.ensureSpace(gap + 1);
    this.y -= gap;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= gap;
  }

  space(amount: number) {
    this.y -= amount;
  }

  heading(title: string) {
    this.ensureSpace(30);
    this.text(title, { size: 13, bold: true, color: ACCENT, gap: 2 });
  }
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export async function renderDiagnosisPdf(data: DiagnosisPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`FixMyIron Diagnosis Report — Session ${data.sessionId}`);
  doc.setProducer("FixMyIron API (pdf-lib)");
  doc.setCreator("FixMyIron");

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const cur = new Cursor(doc, fonts);

  // --- Header --------------------------------------------------------------
  cur.text("FixMyIron", { size: 20, bold: true, color: ACCENT, lineGap: 2 });
  cur.text("Heavy Equipment Diagnostic Report", { size: 13, bold: true, gap: 2 });
  const generated = data.generatedAt ? new Date(data.generatedAt) : new Date();
  const stamp = Number.isNaN(generated.getTime()) ? new Date() : generated;
  cur.text(
    `Session #${data.sessionId}  •  Generated ${stamp.toISOString().replace("T", " ").slice(0, 19)} UTC` +
      (data.modelUsed ? `  •  Model ${data.modelUsed}` : ""),
    { size: 9, color: MUTED },
  );
  cur.rule(10);

  // --- Equipment -----------------------------------------------------------
  cur.heading("Equipment");
  cur.text(`Make:  ${fmt(data.machineMake)}`, { size: 11 });
  cur.text(`Model: ${fmt(data.machineModel)}`, { size: 11 });
  cur.text(`Year:  ${fmt(data.machineYear)}`, { size: 11 });
  cur.text(`Hours: ${fmt(data.machineHours)}`, { size: 11, gap: 6 });

  // --- Reported symptoms ---------------------------------------------------
  cur.heading("Reported Symptoms");
  cur.text(fmt(data.symptoms), { size: 11, gap: 6 });

  // --- Active fault codes --------------------------------------------------
  cur.heading("Active Fault Codes");
  if (data.faultCodes.length === 0) {
    cur.text("None reported.", { size: 11, color: MUTED, gap: 6 });
  } else {
    for (const code of data.faultCodes) {
      cur.text(`•  ${code}`, { size: 11, indent: 6 });
    }
    cur.space(6);
  }

  // --- Recent service ------------------------------------------------------
  if (data.recentService.length > 0) {
    cur.heading("Recent Service / Work Performed");
    for (const svc of data.recentService) cur.text(`•  ${svc}`, { size: 11, indent: 6 });
    cur.space(6);
  }

  // --- Operator notes ------------------------------------------------------
  if (data.operatorNotes && data.operatorNotes.trim()) {
    cur.heading("Operator Notes");
    cur.text(data.operatorNotes, { size: 11, gap: 6 });
  }

  // --- Safety warnings (surfaced early, high priority) --------------------
  if (data.safetyWarnings.length > 0) {
    cur.heading("Safety Warnings");
    for (const warning of data.safetyWarnings) {
      cur.text(`!  ${warning}`, { size: 11, color: WARN, indent: 6 });
    }
    cur.space(6);
  }

  // --- Likely causes -------------------------------------------------------
  cur.heading("Likely Causes");
  if (data.possibleCauses.length === 0) {
    cur.text("No structured causes were recorded for this session.", {
      size: 11,
      color: MUTED,
      gap: 6,
    });
  } else {
    data.possibleCauses.forEach((cause, index) => {
      const likelihood = cause.likelihood ? ` [${String(cause.likelihood).toUpperCase()}]` : "";
      cur.text(`${index + 1}. ${fmt(cause.cause)}${likelihood}`, { size: 11, bold: true });
      if (cause.reasoning) {
        cur.text(cause.reasoning, { size: 10, color: MUTED, indent: 14 });
      }
      cur.space(4);
    });
    cur.space(2);
  }

  // --- Troubleshooting steps ----------------------------------------------
  cur.heading("Troubleshooting Steps");
  if (data.testsInOrder.length === 0) {
    cur.text("No troubleshooting steps were recorded for this session.", {
      size: 11,
      color: MUTED,
      gap: 6,
    });
  } else {
    data.testsInOrder.forEach((step, index) => {
      cur.text(`${index + 1}. ${fmt(step.test)}`, { size: 11, bold: true });
      if (step.tools && step.tools.length > 0) {
        cur.text(`Tools: ${step.tools.join(", ")}`, { size: 10, color: MUTED, indent: 14 });
      }
      if (step.expected_reading_pass) {
        cur.text(`Pass: ${step.expected_reading_pass}`, { size: 10, indent: 14 });
      }
      if (step.expected_reading_fail) {
        cur.text(`Fail: ${step.expected_reading_fail}`, { size: 10, indent: 14 });
      }
      cur.space(4);
    });
    cur.space(2);
  }

  // --- Expected readings ---------------------------------------------------
  const readingEntries = Object.entries(data.expectedReadings ?? {});
  if (readingEntries.length > 0) {
    cur.heading("Expected Readings");
    for (const [label, value] of readingEntries) {
      cur.text(`${label}: ${value}`, { size: 10, indent: 6 });
    }
    cur.space(6);
  }

  // --- Recommended parts ---------------------------------------------------
  cur.heading("Recommended Parts");
  if (data.partsLikelyNeeded.length === 0) {
    cur.text("No parts were recommended for this session.", {
      size: 11,
      color: MUTED,
      gap: 6,
    });
  } else {
    for (const part of data.partsLikelyNeeded) {
      const pn = part.part_number && part.part_number.trim() ? part.part_number : "(no part #)";
      cur.text(`•  ${pn} — ${fmt(part.description)}`, { size: 11, indent: 6 });
      if (part.why) cur.text(part.why, { size: 10, color: MUTED, indent: 20 });
    }
    cur.space(6);
  }

  cur.rule(8);
  cur.text(
    "This report is AI-assisted diagnostic guidance. Verify all readings and follow OEM " +
      "service procedures and lockout/tagout before performing any repair.",
    { size: 8, color: MUTED },
  );

  return doc.save();
}
