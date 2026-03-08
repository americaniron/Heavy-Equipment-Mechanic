import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { storage } from "./storage";
import {
  streamAdminResponse, streamMechanicResponse,
  parseIntakeJson, stripIntakeJson, getMechanicName,
  generateQuickAdviceReport, generateProReport,
  type ConversationMessage,
} from "./services/ai-engine";
import { createAvatarSession, stopAvatarSession, getAvatarInfo } from "./services/avatar";

import { speechToText, ensureCompatibleFormat } from "./replit_integrations/audio/client";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
