import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import {
  streamAdminResponse, streamMechanicResponse,
  parseIntakeJson, stripIntakeJson, getMechanicName,
  generateQuickAdviceReport, generateProReport,
  type ConversationMessage,
} from "./services/ai-engine";
import { createAvatarSession, stopAvatarSession, sendAvatarSpeak, getAvatarInfo } from "./services/avatar";


const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const sessionTokens = new Map<number, string>();

function generateSessionToken(sessionId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  sessionTokens.set(sessionId, token);
  return token;
}

function validateSessionAccess(req: any, sessionId: number): boolean {
  const token = req.headers["x-session-token"] || req.query.token;
  const stored = sessionTokens.get(sessionId);
  return !!(token && stored && token === stored);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const customerSessions = new Map<string, number>();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-auth-token"] as string;
  if (!token || !customerSessions.has(token)) {
    return res.status(401).json({ error: "Authentication required" });
  }
  (req as any).customerId = customerSessions.get(token);
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName, company, phone } = req.body;
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: "Email, password, first name, and last name are required" });
      }
      const existing = await storage.getCustomerByEmail(email.toLowerCase());
      if (existing) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const customer = await storage.createCustomer({
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        company: company || null,
        phone: phone || null,
        role: "user",
        status: "active",
      });
      const authToken = crypto.randomBytes(32).toString("hex");
      customerSessions.set(authToken, customer.id);
      const { passwordHash: _, ...safe } = customer;
      res.json({ ...safe, authToken });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      const customer = await storage.getCustomerByEmail(email.toLowerCase());
      if (!customer) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const valid = await bcrypt.compare(password, customer.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const authToken = crypto.randomBytes(32).toString("hex");
      customerSessions.set(authToken, customer.id);
      const { passwordHash: _, ...safe } = customer;
      res.json({ ...safe, authToken });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const customer = await storage.getCustomerById((req as any).customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      const { passwordHash: _, ...safe } = customer;
      res.json(safe);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = req.headers["x-auth-token"] as string;
    if (token) customerSessions.delete(token);
    res.json({ success: true });
  });

  app.get("/api/portal/dashboard", requireAuth, async (req, res) => {
    try {
      const cid = (req as any).customerId;
      const [equip, srs, tickets, invs, sessions_list] = await Promise.all([
        storage.getEquipment(cid),
        storage.getServiceRequests(cid),
        storage.getSupportTickets(cid),
        storage.getInvoices(cid),
        storage.getSessionsByCustomer(cid),
      ]);
      res.json({
        equipmentCount: equip.length,
        activeEquipment: equip.filter(e => e.status === "active").length,
        openServiceRequests: srs.filter(s => s.status === "open" || s.status === "in_progress").length,
        totalServiceRequests: srs.length,
        openTickets: tickets.filter(t => t.status === "open").length,
        pendingInvoices: invs.filter(i => i.status === "pending").length,
        totalSessions: sessions_list.length,
        recentServiceRequests: srs.slice(0, 5),
        recentSessions: sessions_list.slice(0, 5),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/portal/equipment", requireAuth, async (req, res) => {
    try {
      const items = await storage.getEquipment((req as any).customerId);
      res.json(items);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });
  app.post("/api/portal/equipment", requireAuth, async (req, res) => {
    try {
      const item = await storage.createEquipment({ ...req.body, customerId: (req as any).customerId });
      res.json(item);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });
  app.patch("/api/portal/equipment/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getEquipmentById(Number(req.params.id));
      if (!existing || existing.customerId !== (req as any).customerId) return res.status(404).json({ error: "Equipment not found" });
      const item = await storage.updateEquipment(Number(req.params.id), req.body);
      res.json(item);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });
  app.delete("/api/portal/equipment/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getEquipmentById(Number(req.params.id));
      if (!existing || existing.customerId !== (req as any).customerId) return res.status(404).json({ error: "Equipment not found" });
      await storage.deleteEquipment(Number(req.params.id));
      res.json({ success: true });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/portal/service-requests", requireAuth, async (req, res) => {
    try {
      const items = await storage.getServiceRequests((req as any).customerId);
      res.json(items);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });
  app.post("/api/portal/service-requests", requireAuth, async (req, res) => {
    try {
      const item = await storage.createServiceRequest({ ...req.body, customerId: (req as any).customerId });
      res.json(item);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });
  app.patch("/api/portal/service-requests/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getServiceRequestById(Number(req.params.id));
      if (!existing || existing.customerId !== (req as any).customerId) return res.status(404).json({ error: "Service request not found" });
      const item = await storage.updateServiceRequest(Number(req.params.id), req.body);
      res.json(item);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/portal/work-orders", requireAuth, async (req, res) => {
    try {
      const items = await storage.getWorkOrders((req as any).customerId);
      res.json(items);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/portal/maintenance", requireAuth, async (req, res) => {
    try {
      const items = await storage.getMaintenanceSchedules((req as any).customerId);
      res.json(items);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });
  app.post("/api/portal/maintenance", requireAuth, async (req, res) => {
    try {
      const item = await storage.createMaintenanceSchedule({ ...req.body, customerId: (req as any).customerId });
      res.json(item);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/portal/support-tickets", requireAuth, async (req, res) => {
    try {
      const items = await storage.getSupportTickets((req as any).customerId);
      res.json(items);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });
  app.post("/api/portal/support-tickets", requireAuth, async (req, res) => {
    try {
      const item = await storage.createSupportTicket({ ...req.body, customerId: (req as any).customerId });
      res.json(item);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/portal/documents", requireAuth, async (req, res) => {
    try {
      const items = await storage.getDocuments((req as any).customerId);
      res.json(items);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/portal/invoices", requireAuth, async (req, res) => {
    try {
      const items = await storage.getInvoices((req as any).customerId);
      res.json(items);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.patch("/api/portal/profile", requireAuth, async (req, res) => {
    try {
      const cid = (req as any).customerId;
      const { firstName, lastName, company, phone } = req.body;
      const updated = await storage.updateCustomer(cid, { firstName, lastName, company, phone });
      if (!updated) return res.status(404).json({ error: "Customer not found" });
      const { passwordHash: _, ...safe } = updated;
      res.json(safe);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/portal/escalation", requireAuth, async (req, res) => {
    try {
      const cid = (req as any).customerId;
      const ticket = await storage.createSupportTicket({
        customerId: cid,
        subject: req.body.subject || "Escalation to Human Expert",
        description: req.body.description || "",
        priority: req.body.priority || "high",
        category: "escalation",
        status: "open",
      });
      res.json(ticket);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/portal/cases", requireAuth, async (req, res) => {
    try {
      const sessions_list = await storage.getSessionsByCustomer((req as any).customerId);
      res.json(sessions_list);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const session = await storage.createSession({
        status: "intake",
        tier: "free",
        language: req.body.language || "en",
        consentGiven: req.body.consentGiven || false,
        agentProvider: req.body.provider || "heygen",
      });
      const accessToken = generateSessionToken(session.id);
      res.json({ ...session, accessToken });
    } catch (error: any) {
      console.error("Create session error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      if (!validateSessionAccess(req, sessionId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });
      const messages = await storage.getMessages(session.id);
      const files = await storage.getFiles(session.id);
      res.json({ ...session, messages, files });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/:id/message", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const { content, useVoice, audio } = req.body;

      let userText = content;

      if (useVoice && audio) {
        const rawBuffer = Buffer.from(audio, "base64");
        const { buffer: audioBuffer, format } = await ensureCompatibleFormat(rawBuffer);
        userText = await speechToText(audioBuffer, format);
      }

      if (!userText || !userText.trim()) {
        return res.status(400).json({ error: "Message content is required" });
      }

      const agentType = session.status === "intake" || session.status === "assigned"
        ? "admin"
        : "mechanic";

      await storage.createMessage({
        sessionId,
        role: "user",
        content: userText,
        agentType,
      });

      const existingMessages = await storage.getMessages(sessionId);
      const chatHistory: ConversationMessage[] = existingMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = "";

      const sessionLanguage = session.language || "en";

      if (agentType === "admin") {
        for await (const chunk of streamAdminResponse(chatHistory, sessionLanguage)) {
          fullResponse += chunk;
          res.write(`data: ${JSON.stringify({ type: "text", content: chunk })}\n\n`);
        }

        const intakeData = parseIntakeJson(fullResponse);
        if (intakeData) {
          const cleanResponse = stripIntakeJson(fullResponse);
          fullResponse = cleanResponse;

          const updateData: Record<string, any> = {};
          if (intakeData.customerName) updateData.customerName = intakeData.customerName;
          if (intakeData.customerEmail) updateData.customerEmail = intakeData.customerEmail;
          if (intakeData.customerPhone) updateData.customerPhone = intakeData.customerPhone;
          if (intakeData.company) updateData.company = intakeData.company;
          if (intakeData.equipmentType) updateData.equipmentType = intakeData.equipmentType;
          if (intakeData.make) updateData.make = intakeData.make;
          if (intakeData.model) updateData.model = intakeData.model;
          if (intakeData.year) updateData.year = intakeData.year;
          if (intakeData.serialNumber) updateData.serialNumber = intakeData.serialNumber;
          if (intakeData.serialPrefix) updateData.serialPrefix = intakeData.serialPrefix;
          if (intakeData.smuHours) updateData.smuHours = intakeData.smuHours;
          if (intakeData.problemSummary) updateData.problemSummary = intakeData.problemSummary;
          if (intakeData.faultCodes) updateData.faultCodes = intakeData.faultCodes;
          if (intakeData.issueStarted) updateData.issueStarted = intakeData.issueStarted;
          if (intakeData.location) updateData.location = intakeData.location;
          if (intakeData.canSafelyShutdown !== undefined) updateData.canSafelyShutdown = intakeData.canSafelyShutdown;
          if (intakeData.visitType) updateData.visitType = intakeData.visitType as string;
          if (intakeData.mechanicType) updateData.mechanicType = intakeData.mechanicType as string;
          updateData.intakeJson = intakeData;

          await storage.updateSession(sessionId, updateData);

          if (intakeData.readyForHandoff) {
            res.write(`data: ${JSON.stringify({
              type: "handoff",
              mechanicType: intakeData.mechanicType,
              mechanicName: getMechanicName(intakeData.mechanicType as string, sessionLanguage),
              visitType: intakeData.visitType,
              intakeData,
            })}\n\n`);
          }
        }
      } else {
        const intakeJson = session.intakeJson as Record<string, unknown> | null;
        for await (const chunk of streamMechanicResponse(
          session.mechanicType || "heavy_equipment",
          chatHistory,
          intakeJson,
          sessionLanguage
        )) {
          fullResponse += chunk;
          res.write(`data: ${JSON.stringify({ type: "text", content: chunk })}\n\n`);
        }
      }

      await storage.createMessage({
        sessionId,
        role: "assistant",
        content: fullResponse,
        agentType,
      });

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Message error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  });

  app.post("/api/sessions/:id/handoff", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      await storage.updateSession(sessionId, {
        status: "diagnosing",
        tier: session.visitType === "pro" ? "pro" : "free",
      });

      const handoffLanguage = session.language || "en";
      const mechanicName = getMechanicName(session.mechanicType || "heavy_equipment", handoffLanguage);

      const handoffMessage = handoffLanguage === "ar"
        ? `مرحباً! أنا ${mechanicName}. لقد راجعت معلومات القبول الخاصة بك وأنا مستعد لمساعدتك في تشخيص المشكلة مع ${session.equipmentType || "المعدات"} الخاصة بك. لنبدأ.`
        : `Hello! I'm ${mechanicName}. I've reviewed your intake information and I'm ready to help diagnose the issue with your ${session.equipmentType || "equipment"}. Let's get started.`;

      await storage.createMessage({
        sessionId,
        role: "assistant",
        content: handoffMessage,
        agentType: "mechanic",
      });

      res.json({
        success: true,
        mechanicName,
        mechanicType: session.mechanicType,
        visitType: session.visitType,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/:id/upload", upload.array("files", 10), async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      if (!validateSessionAccess(req, sessionId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const savedFiles = [];
      for (const file of files) {
        const saved = await storage.createFile({
          sessionId,
          fileName: file.originalname,
          fileType: file.mimetype,
          filePath: file.path,
        });
        savedFiles.push(saved);
      }

      res.json(savedFiles);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sessions/:id/files/:fileId", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      if (!validateSessionAccess(req, sessionId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const files = await storage.getFiles(sessionId);
      const file = files.find(f => f.id === parseInt(req.params.fileId));
      if (!file) return res.status(404).json({ error: "File not found" });
      const filePath = path.resolve(file.filePath);
      if (!filePath.startsWith(path.resolve(uploadDir))) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/:id/report", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const messages = await storage.getMessages(sessionId);
      const chatHistory: ConversationMessage[] = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const intakeJson = session.intakeJson as Record<string, unknown> | null;
      const reportType = session.visitType === "pro" ? "pro" : "quick_advice";

      if (reportType === "pro" && session.paymentStatus !== "paid") {
        return res.status(402).json({
          error: "Payment required for Pro report",
          requiresPayment: true,
        });
      }

      let reportContent: Record<string, unknown>;
      let svgDiagram = "";

      if (reportType === "pro") {
        const result = await generateProReport(chatHistory, intakeJson);
        reportContent = result.report;
        svgDiagram = result.svg;
      } else {
        reportContent = await generateQuickAdviceReport(chatHistory, intakeJson);
      }

      const shareToken = crypto.randomBytes(16).toString("hex");

      const report = await storage.createReport({
        sessionId,
        reportType,
        content: reportContent,
        svgDiagram,
        shareToken,
      });

      await storage.updateSession(sessionId, {
        shareToken,
        status: "completed",
      });

      res.json(report);
    } catch (error: any) {
      console.error("Report generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sessions/:id/report", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      if (!validateSessionAccess(req, sessionId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const report = await storage.getReport(sessionId);
      if (!report) return res.status(404).json({ error: "Report not found" });
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/shared/:token", async (req, res) => {
    try {
      const report = await storage.getReportByShareToken(req.params.token);
      if (!report) return res.status(404).json({ error: "Report not found" });

      const session = await storage.getSession(report.sessionId);
      res.json({ report, session });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  app.use("/static", (await import("express")).default.static(path.join(process.cwd(), "attached_assets")));

  app.post("/api/avatar/session", async (req, res) => {
    try {
      const { agentType, language } = req.body;
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.get("host");
      const backgroundUrl = `${protocol}://${host}/static/shop_background.png`;
      const result = await createAvatarSession(agentType || "admin", backgroundUrl, language || "en");
      res.json(result);
    } catch (error: any) {
      console.error("Avatar session creation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  app.post("/api/transcribe", audioUpload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const OpenAI = await import("openai");
      const openai = new OpenAI.default({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const origName = req.file.originalname || "recording.webm";
      const file = await OpenAI.toFile(req.file.buffer, origName);
      const response = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Transcription error:", error.message);
      res.status(500).json({ error: "Transcription failed" });
    }
  });

  app.post("/api/avatar/speak", async (req, res) => {
    try {
      const { sessionToken, text } = req.body;
      if (!sessionToken || !text) {
        return res.status(400).json({ error: "sessionToken and text required" });
      }
      await sendAvatarSpeak(sessionToken, text);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Avatar speak error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/avatar/session/stop", async (req, res) => {
    try {
      const { sessionToken } = req.body;
      if (sessionToken) {
        await stopAvatarSession(sessionToken);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Avatar session stop error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
