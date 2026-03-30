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
import { createDIDStream, sendDIDSdpAnswer, sendDIDIceCandidate, sendDIDSpeak, closeDIDStream, clearDIDAgentCache, checkDIDCredits } from "./services/did-avatar";


const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const sessionTokens = new Map<number, string>();

const verificationEmailHtml = (code: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 30px; background: #111; color: #fff; border-radius: 12px;">
    <h2 style="color: #FFCD11; text-align: center;">AMERICAN IRON</h2>
    <p style="text-align: center; color: #ccc;">Your verification code is:</p>
    <div style="text-align: center; font-size: 36px; font-weight: bold; color: #FFCD11; letter-spacing: 8px; padding: 20px;">${code}</div>
    <p style="text-align: center; color: #888; font-size: 12px;">This code expires in 10 minutes.</p>
  </div>
`;

async function sendEmailViaResend(target: string, code: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[VERIFICATION] RESEND_API_KEY not set, skipping Resend`);
    return false;
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || "AMERICAN IRON <noreply@americanironus.com>";
    console.log(`[VERIFICATION] Sending via Resend from: ${fromEmail} to: ${target.substring(0, 3)}***`);
    const result = await resend.emails.send({
      from: fromEmail,
      to: [target],
      subject: "Your Verification Code - AMERICAN IRON",
      html: verificationEmailHtml(code),
    });
    if (result.error) {
      console.error(`[VERIFICATION] Resend error for ${target.substring(0, 3)}***:`, JSON.stringify(result.error));
      return false;
    }
    console.log(`[VERIFICATION] Email sent via Resend to ${target.substring(0, 3)}***, id: ${result.data?.id}`);
    return true;
  } catch (err: any) {
    console.error(`[VERIFICATION] Resend delivery failed for ${target.substring(0, 3)}***:`, err.message);
    return false;
  }
}

async function sendEmailViaSMTP(target: string, code: string): Promise<boolean> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn(`[VERIFICATION] SMTP credentials not set (SMTP_USER: ${!!process.env.SMTP_USER}, SMTP_PASS: ${!!process.env.SMTP_PASS})`);
    return false;
  }
  try {
    const nodemailer = await import("nodemailer");
    const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
    let smtpPort = parseInt(process.env.SMTP_PORT || "587");
    if (smtpHost.includes("gmail.com") && smtpPort !== 465 && smtpPort !== 587 && smtpPort !== 25) {
      console.warn(`[VERIFICATION] SMTP port ${smtpPort} invalid for Gmail, using 587`);
      smtpPort = 587;
    }
    console.log(`[VERIFICATION] SMTP connecting to ${smtpHost}:${smtpPort}`);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: (process.env.SMTP_PASS || "").replace(/\s/g, ""),
      },
      tls: {
        rejectUnauthorized: false,
        ciphers: "SSLv3",
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });
    await transporter.sendMail({
      from: `"AMERICAN IRON" <${process.env.SMTP_USER}>`,
      to: target,
      subject: "Your Verification Code - AMERICAN IRON",
      html: verificationEmailHtml(code),
    });
    console.log(`[VERIFICATION] Email sent via SMTP to ${target.substring(0, 3)}***`);
    return true;
  } catch (err: any) {
    console.error(`[VERIFICATION] SMTP delivery failed for ${target.substring(0, 3)}*** (host: ${process.env.SMTP_HOST}, port: ${process.env.SMTP_PORT}):`, err.message);
    return false;
  }
}

async function deliverVerificationCode(target: string, targetType: string, code: string): Promise<boolean> {
  if (targetType === "email") {
    const sentViaResend = await sendEmailViaResend(target, code);
    if (sentViaResend) return true;

    const sentViaSMTP = await sendEmailViaSMTP(target, code);
    if (sentViaSMTP) return true;

    console.warn(`[VERIFICATION] No email service configured. Set RESEND_API_KEY or SMTP_USER/SMTP_PASS.`);
    return false;
  } else if (targetType === "phone") {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      try {
        const twilio = await import("twilio");
        const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          body: `Your AMERICAN IRON verification code is: ${code}. It expires in 10 minutes.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: target,
        });
        console.log(`[VERIFICATION] SMS sent to ${target.substring(0, 3)}***`);
        return true;
      } catch (smsErr: any) {
        console.error(`[VERIFICATION] SMS delivery failed for ${target.substring(0, 3)}***:`, smsErr.message);
        return false;
      }
    } else {
      console.warn(`[VERIFICATION] No Twilio credentials configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.`);
      return false;
    }
  }
  return false;
}

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

  clearDIDAgentCache();

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

        const verifyRequestMatch = fullResponse.match(/<VERIFY_REQUEST>([\s\S]*?)<\/VERIFY_REQUEST>/);
        if (verifyRequestMatch) {
          try {
            const verifyData = JSON.parse(verifyRequestMatch[1]);
            const code = String(Math.floor(1000 + Math.random() * 9000));
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            await storage.createVerificationCode({
              sessionId,
              target: verifyData.target.toLowerCase(),
              targetType: verifyData.targetType,
              code,
              verified: false,
              expiresAt,
            });
            const delivered = await deliverVerificationCode(verifyData.target, verifyData.targetType, code);
            console.log(`[VERIFICATION] Code sent for ${verifyData.targetType} ${verifyData.target.substring(0,3)}***: delivered=${delivered}`);
            res.write(`data: ${JSON.stringify({ type: "verify_request", target: verifyData.target, targetType: verifyData.targetType, delivered })}\n\n`);
          } catch (e) {
            console.error("Verify request parse error:", e);
          }
          fullResponse = fullResponse.replace(/<VERIFY_REQUEST>[\s\S]*?<\/VERIFY_REQUEST>/g, "").trim();
        }

        const verifyCodeMatch = fullResponse.match(/<VERIFY_CODE>([\s\S]*?)<\/VERIFY_CODE>/);
        if (verifyCodeMatch) {
          try {
            const codeData = JSON.parse(verifyCodeMatch[1]);
            const vc = await storage.getVerificationCode(codeData.target, codeData.code);
            if (vc && new Date() <= vc.expiresAt) {
              await storage.markVerified(vc.id);
              res.write(`data: ${JSON.stringify({ type: "verify_result", verified: true, target: codeData.target })}\n\n`);
            } else {
              res.write(`data: ${JSON.stringify({ type: "verify_result", verified: false, target: codeData.target })}\n\n`);
            }
          } catch (e) {
            console.error("Verify code parse error:", e);
          }
          fullResponse = fullResponse.replace(/<VERIFY_CODE>[\s\S]*?<\/VERIFY_CODE>/g, "").trim();
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
      if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

      if (!validateSessionAccess(req, sessionId)) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const existingReport = await storage.getReport(sessionId);
      if (existingReport) {
        console.log(`Report already exists for session ${sessionId}, returning existing`);
        return res.json(existingReport);
      }

      const messages = await storage.getMessages(sessionId);
      console.log(`Generating report for session ${sessionId}: ${messages.length} messages found`);
      
      const chatHistory: ConversationMessage[] = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
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

      console.log(`Calling AI to generate ${reportType} report for session ${sessionId}...`);

      if (reportType === "pro") {
        const result = await generateProReport(chatHistory, intakeJson);
        reportContent = result.report;
        svgDiagram = result.svg;
      } else {
        reportContent = await generateQuickAdviceReport(chatHistory, intakeJson);
      }

      if (reportContent.error) {
        console.error(`AI report generation returned error for session ${sessionId}:`, reportContent.error);
        return res.status(502).json({ error: "Failed to generate report. Please try again." });
      }

      const shareToken = crypto.randomBytes(16).toString("hex");

      const report = await storage.createReport({
        sessionId,
        reportType,
        content: reportContent,
        svgDiagram,
        shareToken,
      });

      console.log(`Report created successfully for session ${sessionId}, id: ${report.id}`);

      await storage.updateSession(sessionId, {
        shareToken,
        status: "completed",
      });

      try {
        await createVisitLogForSession(sessionId);
      } catch (logErr) {
        console.error("Visit log creation error:", logErr);
      }

      res.json(report);
    } catch (error: any) {
      console.error("Report generation error:", error?.message, error?.stack);
      res.status(500).json({ error: "Failed to generate report. Please try again." });
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
      const aType = agentType || "admin";
      const lang = language || "en";

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.get("host");
      const backgroundUrl = `${protocol}://${host}/static/shop_background.png`;

      try {
        const heygenResult = await createAvatarSession(aType, backgroundUrl, lang);
        console.log(`[Avatar] Using HeyGen (primary) for ${aType}/${lang}`);
        return res.json({ ...heygenResult, provider: "heygen" });
      } catch (heygenErr: any) {
        console.warn(`[Avatar] HeyGen failed, falling back to D-ID:`, heygenErr.message);
      }

      const credits = await checkDIDCredits();
      if (credits > 0) {
        try {
          const didResult = await createDIDStream(aType, lang);
          console.log(`[Avatar] Using D-ID (fallback) for ${aType}/${lang} (credits: ${credits})`);
          return res.json(didResult);
        } catch (didErr: any) {
          console.warn(`[Avatar] D-ID fallback also failed:`, didErr.message);
        }
      } else {
        console.log(`[Avatar] D-ID credits exhausted (${credits}), cannot use as fallback`);
      }

      throw new Error("All avatar providers failed (HeyGen primary + D-ID fallback)");
    } catch (error: any) {
      console.error("Avatar session creation error (both providers failed):", error);
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
      const { sessionToken, text, provider, agentId, streamId, sessionId: didSessionId, agentType, language } = req.body;
      if (provider === "did") {
        if (!agentId || !streamId || !didSessionId || !text) {
          return res.status(400).json({ error: "agentId, streamId, sessionId, and text required for D-ID" });
        }
        await sendDIDSpeak(agentId, streamId, didSessionId, text, agentType || "admin", language || "en");
        return res.json({ success: true });
      }
      if (!sessionToken || !text) {
        return res.status(400).json({ error: "sessionToken and text required" });
      }
      await sendAvatarSpeak(sessionToken, text);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Avatar speak error:", error.message);
      if (error.message?.includes("402")) {
        return res.status(402).json({ error: "credits_exhausted", message: "D-ID credits exhausted" });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/avatar/session/sdp", async (req, res) => {
    try {
      const { agentId, streamId, sessionId: didSessionId, answer } = req.body;
      if (!agentId || !streamId || !didSessionId || !answer) {
        return res.status(400).json({ error: "agentId, streamId, sessionId, and answer required" });
      }
      await sendDIDSdpAnswer(agentId, streamId, didSessionId, answer);
      res.json({ success: true });
    } catch (error: any) {
      console.error("D-ID SDP error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/avatar/session/ice", async (req, res) => {
    try {
      const { agentId, streamId, sessionId: didSessionId, candidate, sdpMid, sdpMLineIndex } = req.body;
      if (!agentId || !streamId || !didSessionId) {
        return res.status(400).json({ error: "agentId, streamId, sessionId required" });
      }
      await sendDIDIceCandidate(agentId, streamId, didSessionId, candidate, sdpMid, sdpMLineIndex);
      res.json({ success: true });
    } catch (error: any) {
      console.error("D-ID ICE error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/avatar/session/stop", async (req, res) => {
    try {
      const { sessionToken, provider, agentId, streamId, sessionId: didSessionId } = req.body;
      if (provider === "did" && agentId && streamId && didSessionId) {
        await closeDIDStream(agentId, streamId, didSessionId);
      } else if (sessionToken) {
        await stopAvatarSession(sessionToken);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Avatar session stop error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/verify/send", async (req, res) => {
    try {
      const { target, targetType, sessionId } = req.body;
      if (!target || !targetType) {
        return res.status(400).json({ error: "target and targetType required" });
      }

      if (targetType === "email") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(target)) {
          return res.status(400).json({ error: "Invalid email format" });
        }
      } else if (targetType === "phone") {
        const phoneRegex = /^[\d\s\-\+\(\)]{7,20}$/;
        if (!phoneRegex.test(target)) {
          return res.status(400).json({ error: "Invalid phone format" });
        }
      }

      const code = String(Math.floor(1000 + Math.random() * 9000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await storage.createVerificationCode({
        sessionId: sessionId || null,
        target: target.toLowerCase(),
        targetType,
        code,
        verified: false,
        expiresAt,
      });

      const delivered = await deliverVerificationCode(target, targetType, code);

      if (delivered) {
        res.json({ success: true, message: `Verification code sent to ${targetType}` });
      } else {
        res.json({ success: true, delivered: false, message: `Verification code created but could not be delivered. Check server logs for details.` });
      }
    } catch (error: any) {
      console.error("Verification send error:", error);
      res.status(500).json({ error: "Failed to send verification code" });
    }
  });

  const verifyAttempts = new Map<string, { count: number; lastAttempt: number }>();

  app.post("/api/verify/check", async (req, res) => {
    try {
      const { target, code } = req.body;
      if (!target || !code) {
        return res.status(400).json({ error: "target and code required" });
      }

      const key = target.toLowerCase();
      const now = Date.now();
      const attempts = verifyAttempts.get(key);
      if (attempts) {
        if (now - attempts.lastAttempt < 60000 && attempts.count >= 5) {
          return res.status(429).json({ error: "Too many attempts. Please wait 1 minute.", verified: false });
        }
        if (now - attempts.lastAttempt >= 60000) {
          verifyAttempts.set(key, { count: 1, lastAttempt: now });
        } else {
          attempts.count++;
          attempts.lastAttempt = now;
        }
      } else {
        verifyAttempts.set(key, { count: 1, lastAttempt: now });
      }

      const vc = await storage.getVerificationCode(key, code);
      if (!vc) {
        return res.status(400).json({ error: "Invalid verification code", verified: false });
      }

      if (new Date() > vc.expiresAt) {
        return res.status(400).json({ error: "Verification code has expired", verified: false });
      }

      await storage.markVerified(vc.id);
      verifyAttempts.delete(key);
      res.json({ verified: true });
    } catch (error: any) {
      console.error("Verification check error:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  async function createVisitLogForSession(sessionId: number) {
    const session = await storage.getSession(sessionId);
    if (!session) return null;

    const existing = await storage.getVisitLogBySession(sessionId);
    if (existing) return existing;

    const report = await storage.getReport(sessionId);

    let emailVerified = false;
    let phoneVerified = false;
    if (session.customerEmail) {
      const vc = await storage.getLatestVerificationForTarget(session.customerEmail.toLowerCase());
      emailVerified = vc?.verified === true;
    }
    if (session.customerPhone) {
      const vc = await storage.getLatestVerificationForTarget(session.customerPhone);
      phoneVerified = vc?.verified === true;
    }

    return storage.createVisitLog({
      sessionId,
      customerName: session.customerName,
      customerEmail: session.customerEmail,
      customerPhone: session.customerPhone,
      company: session.company,
      equipmentType: session.equipmentType,
      make: session.make,
      model: session.model,
      year: session.year,
      serialNumber: session.serialNumber,
      problemSummary: session.problemSummary,
      faultCodes: session.faultCodes,
      visitType: session.visitType,
      mechanicType: session.mechanicType,
      status: session.status || "completed",
      emailVerified,
      phoneVerified,
      reportData: report?.content || null,
      conversationSummary: null,
      language: session.language,
    });
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "americaniron2024";
  const adminTokens = new Map<string, number>();
  const ADMIN_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Invalid admin password" });
      }
      const token = crypto.randomBytes(32).toString("hex");
      adminTokens.set(token, Date.now() + ADMIN_TOKEN_EXPIRY_MS);
      res.json({ token });
    } catch (error: any) {
      res.status(500).json({ error: "Admin login failed" });
    }
  });

  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const token = req.headers["x-admin-token"] as string;
    if (!token) {
      return res.status(401).json({ error: "Admin authentication required" });
    }
    const expiry = adminTokens.get(token);
    if (!expiry || Date.now() > expiry) {
      adminTokens.delete(token);
      return res.status(401).json({ error: "Admin authentication required" });
    }
    next();
  }

  app.post("/api/admin/sessions/:id/visit-log", requireAdmin, async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const log = await createVisitLogForSession(sessionId);
      if (!log) return res.status(404).json({ error: "Session not found" });
      res.json(log);
    } catch (error: any) {
      console.error("Visit log error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
    try {
      const allSessions = await storage.getAllSessions();
      const allVisitLogs = await storage.getAllVisitLogs();
      const allCustomers = await storage.getAllCustomers();

      const totalVisits = allSessions.length;
      const completedVisits = allSessions.filter(s => s.status === "completed").length;
      const activeVisits = allSessions.filter(s => s.status !== "completed").length;
      const uniqueEmails = new Set(allSessions.filter(s => s.customerEmail).map(s => s.customerEmail)).size;

      const visitsByType: Record<string, number> = {};
      allSessions.forEach(s => {
        const t = s.mechanicType || "admin";
        visitsByType[t] = (visitsByType[t] || 0) + 1;
      });

      res.json({
        totalVisits,
        completedVisits,
        activeVisits,
        uniqueCustomers: uniqueEmails,
        registeredCustomers: allCustomers.length,
        visitsByType,
        recentVisits: allSessions.slice(0, 20),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/visits", requireAdmin, async (_req, res) => {
    try {
      const allSessions = await storage.getAllSessions();
      const visitLogs = await storage.getAllVisitLogs();

      const visits = allSessions.map(session => {
        const log = visitLogs.find(vl => vl.sessionId === session.id);
        return {
          id: session.id,
          customerName: session.customerName,
          customerEmail: session.customerEmail,
          customerPhone: session.customerPhone,
          company: session.company,
          equipmentType: session.equipmentType,
          make: session.make,
          model: session.model,
          year: session.year,
          serialNumber: session.serialNumber,
          problemSummary: session.problemSummary,
          faultCodes: session.faultCodes,
          visitType: session.visitType,
          mechanicType: session.mechanicType,
          status: session.status,
          language: session.language,
          createdAt: session.createdAt,
          emailVerified: log?.emailVerified || false,
          phoneVerified: log?.phoneVerified || false,
          hasReport: !!log?.reportData,
        };
      });

      res.json(visits);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/visits/:id", requireAdmin, async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const detail = await storage.getSessionWithMessages(sessionId);
      const visitLog = await storage.getVisitLogBySession(sessionId);
      res.json({ ...detail, visitLog });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/customers", requireAdmin, async (_req, res) => {
    try {
      const allCustomers = await storage.getAllCustomers();
      const result = allCustomers.map(c => {
        const { passwordHash, ...safe } = c;
        return safe;
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
