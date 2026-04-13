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
  type ConversationMessage, type SessionContext,
} from "./services/ai-engine";
import { createAvatarSession, stopAvatarSession, sendAvatarSpeak, getAvatarInfo, listAvailableAvatars } from "./services/avatar";
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

async function sendQuoteConfirmationEmail(email: string, firstName: string, refNumber: string, validItems: number, totalItems: number): Promise<void> {
  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #111; border: 1px solid #333; border-radius: 8px; overflow: hidden;">
    <div style="background: #FFCD11; padding: 20px; text-align: center;">
      <h1 style="margin: 0; color: #111; font-size: 24px; letter-spacing: 4px;">AMERICAN IRON</h1>
      <p style="margin: 5px 0 0; color: #333; font-size: 14px;">Parts Quote Request Received</p>
    </div>
    <div style="padding: 30px; color: #ddd;">
      <p style="font-size: 16px;">Hi ${firstName},</p>
      <p>Your parts quote request has been received and is being reviewed by our sales team.</p>
      <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px; color: #FFCD11; font-weight: bold;">Reference Number</p>
        <p style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 2px;">${refNumber}</p>
      </div>
      <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 4px;"><strong style="color: #FFCD11;">Parts Submitted:</strong> ${totalItems} item${totalItems > 1 ? 's' : ''}</p>
        <p style="margin: 0;"><strong style="color: #FFCD11;">Validated:</strong> ${validItems} of ${totalItems}</p>
      </div>
      <p><strong>What happens next:</strong></p>
      <ol style="padding-left: 20px; line-height: 1.8;">
        <li>Our sales team will review your parts list</li>
        <li>We'll prepare a formal quote with accurate pricing</li>
        <li>You'll receive your official quote via email shortly</li>
      </ol>
      <p>You can track the status of your quote request anytime in your <strong>Customer Portal</strong>.</p>
      <p style="margin-top: 30px; color: #888; font-size: 12px; border-top: 1px solid #333; padding-top: 16px;">
        If you have any questions, our team is here to help.<br/>
        &copy; ${new Date().getFullYear()} AMERICAN IRON — americanironus.com
      </p>
    </div>
  </div>`;

  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "AMERICAN IRON <noreply@americanironus.com>",
        to: [email],
        subject: `Quote Request ${refNumber} Received — AMERICAN IRON`,
        html,
      });
      console.log(`[QUOTE] Confirmation email sent via Resend to ${email.substring(0, 3)}***`);
      return;
    } catch (err: any) {
      console.error(`[QUOTE] Resend failed:`, err.message);
    }
  }

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: parseInt(process.env.SMTP_PORT || "587") === 465,
        auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS || "").replace(/\s/g, "") },
        tls: { rejectUnauthorized: false },
      });
      await transporter.sendMail({
        from: `"AMERICAN IRON" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Quote Request ${refNumber} Received — AMERICAN IRON`,
        html,
      });
      console.log(`[QUOTE] Confirmation email sent via SMTP to ${email.substring(0, 3)}***`);
      return;
    } catch (err: any) {
      console.error(`[QUOTE] SMTP failed:`, err.message);
    }
  }

  console.warn(`[QUOTE] No email service configured — confirmation email NOT sent for ${refNumber}`);
}

async function sendQuoteNotificationToAdmin(
  customerName: string,
  customerEmail: string,
  customerPhone: string | null,
  company: string | null,
  refNumber: string,
  totalItems: number,
  items: Array<{ partNumber: string; description?: string; quantity: number; make?: string; urgency?: string }>,
  equipmentInfo: string | null,
  notes: string | null
): Promise<void> {
  const adminEmail = "adam@americanironus.com";
  const partsEmail = "parts@americanironus.com";

  const itemRows = items.map((item, i) =>
    `<tr style="border-bottom: 1px solid #333;">
      <td style="padding: 8px; color: #ddd;">${i + 1}</td>
      <td style="padding: 8px; color: #FFCD11; font-weight: bold;">${item.partNumber}</td>
      <td style="padding: 8px; color: #ddd;">${item.description || '—'}</td>
      <td style="padding: 8px; color: #ddd; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; color: #ddd;">${item.make || '—'}</td>
      <td style="padding: 8px; color: #ddd;">${item.urgency === 'emergency' ? '<span style="color:#ef4444;font-weight:bold;">EMERGENCY</span>' : item.urgency === 'urgent' ? '<span style="color:#f97316;font-weight:bold;">URGENT</span>' : 'Standard'}</td>
    </tr>`
  ).join("");

  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #111; border: 1px solid #333; border-radius: 8px; overflow: hidden;">
    <div style="background: #FFCD11; padding: 20px; text-align: center;">
      <h1 style="margin: 0; color: #111; font-size: 24px; letter-spacing: 4px;">AMERICAN IRON</h1>
      <p style="margin: 5px 0 0; color: #333; font-size: 14px; font-weight: bold;">New Parts Quote Request</p>
    </div>
    <div style="padding: 30px; color: #ddd;">
      <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 0 0 4px; color: #FFCD11; font-weight: bold; font-size: 18px;">Reference: ${refNumber}</p>
        <p style="margin: 0; color: #888; font-size: 12px;">Submitted ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" })}</p>
      </div>

      <h3 style="color: #FFCD11; margin: 0 0 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Customer Information</h3>
      <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 0 0 4px;"><strong>Name:</strong> ${customerName}</p>
        <p style="margin: 0 0 4px;"><strong>Email:</strong> <a href="mailto:${customerEmail}" style="color: #FFCD11;">${customerEmail}</a></p>
        ${customerPhone ? `<p style="margin: 0 0 4px;"><strong>Phone:</strong> ${customerPhone}</p>` : ''}
        ${company ? `<p style="margin: 0;"><strong>Company:</strong> ${company}</p>` : ''}
      </div>

      ${equipmentInfo ? `
      <h3 style="color: #FFCD11; margin: 0 0 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Equipment</h3>
      <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 0;">${equipmentInfo}</p>
      </div>` : ''}

      <h3 style="color: #FFCD11; margin: 0 0 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Parts Requested (${totalItems} item${totalItems > 1 ? 's' : ''})</h3>
      <div style="overflow-x: auto; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; background: #1a1a1a; border: 1px solid #333; border-radius: 6px;">
          <thead>
            <tr style="background: #222; border-bottom: 2px solid #FFCD11;">
              <th style="padding: 10px 8px; color: #FFCD11; text-align: left; font-size: 12px;">#</th>
              <th style="padding: 10px 8px; color: #FFCD11; text-align: left; font-size: 12px;">Part Number</th>
              <th style="padding: 10px 8px; color: #FFCD11; text-align: left; font-size: 12px;">Description</th>
              <th style="padding: 10px 8px; color: #FFCD11; text-align: center; font-size: 12px;">Qty</th>
              <th style="padding: 10px 8px; color: #FFCD11; text-align: left; font-size: 12px;">Make</th>
              <th style="padding: 10px 8px; color: #FFCD11; text-align: left; font-size: 12px;">Urgency</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>

      ${notes ? `
      <h3 style="color: #FFCD11; margin: 0 0 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Customer Notes</h3>
      <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 0;">${notes}</p>
      </div>` : ''}

      <div style="background: #222; border: 1px solid #FFCD11; border-radius: 6px; padding: 16px; text-align: center;">
        <p style="margin: 0; color: #FFCD11; font-weight: bold;">Action Required: Prepare and send a formal quote to this customer.</p>
      </div>
    </div>
  </div>`;

  const subject = `New Quote Request ${refNumber} — ${customerName}${company ? ` (${company})` : ''} — ${totalItems} part${totalItems > 1 ? 's' : ''}`;

  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "AMERICAN IRON <noreply@americanironus.com>",
        to: [adminEmail, partsEmail],
        subject,
        html,
      });
      console.log(`[QUOTE] Admin notification sent via Resend to ${adminEmail} and ${partsEmail}`);
      return;
    } catch (err: any) {
      console.error(`[QUOTE] Resend admin notification failed:`, err.message);
    }
  }

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: parseInt(process.env.SMTP_PORT || "587") === 465,
        auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS || "").replace(/\s/g, "") },
        tls: { rejectUnauthorized: false },
      });
      await transporter.sendMail({
        from: `"AMERICAN IRON" <${process.env.SMTP_USER}>`,
        to: `${adminEmail}, ${partsEmail}`,
        subject,
        html,
      });
      console.log(`[QUOTE] Admin notification sent via SMTP to ${adminEmail} and ${partsEmail}`);
      return;
    } catch (err: any) {
      console.error(`[QUOTE] SMTP admin notification failed:`, err.message);
    }
  }

  console.warn(`[QUOTE] No email service configured — admin notification NOT sent for ${refNumber}`);
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
      const { email, password, firstName, lastName, company, phone,
              equipmentType, equipmentMake, equipmentModel, equipmentYear,
              equipmentSerial, equipmentSmuHours, problemSummary, faultCodes, equipmentLocation } = req.body;
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

      if (equipmentType) {
        try {
          const equipName = [equipmentMake, equipmentModel, equipmentYear].filter(Boolean).join(" ") || equipmentType;
          const equip = await storage.createEquipment({
            customerId: customer.id,
            name: equipName,
            type: equipmentType,
            make: equipmentMake || null,
            model: equipmentModel || null,
            year: equipmentYear || null,
            serialNumber: equipmentSerial || null,
            smuHours: equipmentSmuHours || null,
            notes: equipmentLocation ? `Location: ${equipmentLocation}` : null,
            status: "active",
          });

          if (problemSummary) {
            await storage.createServiceRequest({
              customerId: customer.id,
              equipmentId: equip.id,
              type: "diagnostic",
              status: "open",
              priority: "normal",
              description: problemSummary,
              faultCodes: faultCodes || null,
              assignedMechanic: null,
              estimatedCost: null,
            });
          }
        } catch (equipErr) {
          console.error("Equipment/SR creation during registration:", equipErr);
        }
      }

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

  const PARTS_CATALOG: Record<string, { partNumber: string; name: string; description: string; category: string; makes: string[]; price?: string }> = {
    "1R-0750": { partNumber: "1R-0750", name: "Fuel Filter", description: "Advanced efficiency fuel filter — CAT proprietary media", category: "Filters", makes: ["CAT", "Caterpillar"], price: "42.50" },
    "1R-0751": { partNumber: "1R-0751", name: "Fuel Filter (Secondary)", description: "Secondary fuel/water separator filter element", category: "Filters", makes: ["CAT", "Caterpillar"], price: "38.00" },
    "1R-0749": { partNumber: "1R-0749", name: "Fuel Filter (Primary)", description: "Primary fuel filter — spin-on type for C-series engines", category: "Filters", makes: ["CAT", "Caterpillar"], price: "35.00" },
    "6I-2501": { partNumber: "6I-2501", name: "Air Filter (Primary)", description: "Primary radial seal air filter element", category: "Filters", makes: ["CAT", "Caterpillar"], price: "65.00" },
    "6I-2502": { partNumber: "6I-2502", name: "Air Filter (Secondary)", description: "Secondary/safety air filter element", category: "Filters", makes: ["CAT", "Caterpillar"], price: "45.00" },
    "1R-0739": { partNumber: "1R-0739", name: "Engine Oil Filter", description: "High-efficiency engine oil filter — spin-on cartridge", category: "Filters", makes: ["CAT", "Caterpillar"], price: "28.00" },
    "5I-8670": { partNumber: "5I-8670", name: "Hydraulic Oil Filter", description: "Hydraulic return oil filter element", category: "Filters", makes: ["CAT", "Caterpillar"], price: "52.00" },
    "093-7521": { partNumber: "093-7521", name: "Hydraulic Seal Kit", description: "Bucket cylinder hydraulic seal kit — includes all o-rings and seals", category: "Hydraulics", makes: ["CAT", "Caterpillar"], price: "185.00" },
    "7X-2550": { partNumber: "7X-2550", name: "Fan Belt", description: "V-belt for engine cooling fan drive", category: "Belts & Hoses", makes: ["CAT", "Caterpillar"], price: "22.00" },
    "4I-7575": { partNumber: "4I-7575", name: "Water Pump", description: "Engine coolant water pump assembly", category: "Cooling", makes: ["CAT", "Caterpillar"], price: "320.00" },
    "2P-4301": { partNumber: "2P-4301", name: "Starter Motor", description: "24V electric starter motor assembly", category: "Electrical", makes: ["CAT", "Caterpillar"], price: "850.00" },
    "8T-9573": { partNumber: "8T-9573", name: "Alternator", description: "24V alternator — 95 amp output", category: "Electrical", makes: ["CAT", "Caterpillar"], price: "650.00" },
    "110-6326": { partNumber: "110-6326", name: "Turbocharger", description: "Turbocharger assembly for 3116/3126 engines", category: "Engine", makes: ["CAT", "Caterpillar"], price: "2400.00" },
    "584-2156": { partNumber: "584-2156", name: "ECM Module", description: "Electronic control module — engine management computer", category: "Electrical", makes: ["CAT", "Caterpillar"], price: "3200.00" },
    "600-311-3310": { partNumber: "600-311-3310", name: "Fuel Filter", description: "Engine fuel filter element — spin-on type", category: "Filters", makes: ["Komatsu"], price: "38.00" },
    "600-185-3100": { partNumber: "600-185-3100", name: "Air Filter (Primary)", description: "Primary air cleaner element — outer", category: "Filters", makes: ["Komatsu"], price: "72.00" },
    "6742-01-4540": { partNumber: "6742-01-4540", name: "Oil Filter", description: "Full-flow lube oil filter — SAA6D114E engine", category: "Filters", makes: ["Komatsu"], price: "32.00" },
    "07000-12012": { partNumber: "07000-12012", name: "O-Ring Seal", description: "Hydraulic cylinder o-ring — standard size", category: "Seals", makes: ["Komatsu"], price: "4.50" },
    "20Y-60-31621": { partNumber: "20Y-60-31621", name: "Hydraulic Pump", description: "Main hydraulic pump assembly — PC200-8", category: "Hydraulics", makes: ["Komatsu"], price: "4500.00" },
    "AT314583": { partNumber: "AT314583", name: "Fuel Filter", description: "Fuel filter/water separator — Tier 4 engines", category: "Filters", makes: ["John Deere", "Deere"], price: "45.00" },
    "AT365870": { partNumber: "AT365870", name: "Engine Oil Filter", description: "Premium engine oil filter element", category: "Filters", makes: ["John Deere", "Deere"], price: "35.00" },
    "AT171853": { partNumber: "AT171853", name: "Air Filter (Primary)", description: "Primary outer air filter element", category: "Filters", makes: ["John Deere", "Deere"], price: "68.00" },
    "RE507878": { partNumber: "RE507878", name: "DEF Filter", description: "Diesel exhaust fluid filter — after-treatment system", category: "Filters", makes: ["John Deere", "Deere"], price: "55.00" },
    "RE546336": { partNumber: "RE546336", name: "Hydraulic Filter", description: "Return hydraulic oil filter element", category: "Filters", makes: ["John Deere", "Deere"], price: "58.00" },
    "RE523236": { partNumber: "RE523236", name: "Coolant Filter", description: "Engine coolant conditioner filter", category: "Filters", makes: ["John Deere", "Deere"], price: "18.00" },
  };

  const SERIAL_PREFIX_MAP: Record<string, { make: string; type: string; models: string[] }> = {
    "CAT": { make: "CAT", type: "Excavator", models: ["320F", "330F", "336F", "349F"] },
    "7WJ": { make: "CAT", type: "Loader", models: ["966F", "966G", "966H"] },
    "5YW": { make: "CAT", type: "Excavator", models: ["320C", "320D", "320E"] },
    "BFM": { make: "CAT", type: "Excavator", models: ["336E", "336F"] },
    "JJG": { make: "CAT", type: "Excavator", models: ["349E", "349F"] },
    "MBH": { make: "CAT", type: "Dozer", models: ["D6T", "D6R"] },
    "TMC": { make: "CAT", type: "Dozer", models: ["D8T", "D8R"] },
    "HEX": { make: "CAT", type: "Excavator", models: ["320", "325", "330"] },
    "KOM": { make: "Komatsu", type: "Excavator", models: ["PC200-8", "PC210-10", "PC360"] },
    "PC2": { make: "Komatsu", type: "Excavator", models: ["PC200-8", "PC200-10"] },
    "PC3": { make: "Komatsu", type: "Excavator", models: ["PC300-8", "PC350-10"] },
    "WA3": { make: "Komatsu", type: "Loader", models: ["WA320", "WA380"] },
    "D37": { make: "Komatsu", type: "Dozer", models: ["D37EX", "D37PX"] },
    "JD": { make: "John Deere", type: "Excavator", models: ["210G", "350G", "470G"] },
    "DER": { make: "John Deere", type: "Loader", models: ["544K", "644K", "744K"] },
    "1DW": { make: "John Deere", type: "Excavator", models: ["200D", "210G"] },
    "1FF": { make: "John Deere", type: "Excavator", models: ["350G", "380G"] },
  };

  app.get("/api/portal/parts", requireAuth, async (req, res) => {
    try {
      const serial = (req.query.serial as string || "").trim().toUpperCase();
      if (!serial || serial.length < 2) {
        return res.json([]);
      }

      let matchedMake: string | null = null;
      let matchedInfo: any = null;
      for (const [prefix, info] of Object.entries(SERIAL_PREFIX_MAP)) {
        if (serial.startsWith(prefix.toUpperCase())) {
          matchedMake = info.make;
          matchedInfo = info;
          break;
        }
      }

      let results: any[] = [];
      if (matchedMake) {
        results = Object.values(PARTS_CATALOG)
          .filter(p => p.makes.some(m => m.toUpperCase() === matchedMake!.toUpperCase()))
          .map(p => ({
            ...p,
            compatibility: `Compatible with ${matchedInfo.make} ${matchedInfo.type} — ${matchedInfo.models.join(", ")}`,
          }));
      } else {
        const allParts = Object.values(PARTS_CATALOG);
        results = allParts.filter(p =>
          p.partNumber.toUpperCase().includes(serial) ||
          p.name.toUpperCase().includes(serial) ||
          p.category.toUpperCase().includes(serial)
        );
      }

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/portal/parts/validate", requireAuth, async (req, res) => {
    try {
      const partNumber = (req.query.partNumber as string || "").trim();
      if (!partNumber) {
        return res.json({ valid: false, error: "Part number is required" });
      }

      const normalizedPN = partNumber.toUpperCase().replace(/\s+/g, "");
      const catalog = PARTS_CATALOG[partNumber] || PARTS_CATALOG[normalizedPN] ||
        Object.values(PARTS_CATALOG).find(p => p.partNumber.toUpperCase().replace(/\s+/g, "") === normalizedPN);

      if (catalog) {
        return res.json({
          valid: true,
          partNumber: catalog.partNumber,
          name: catalog.name,
          description: catalog.description,
          category: catalog.category,
          price: catalog.price,
        });
      }

      const partNumberPattern = /^[A-Za-z0-9\-\.\/\s]{2,50}$/;
      if (partNumberPattern.test(partNumber)) {
        return res.json({
          valid: true,
          partNumber,
          name: null,
          description: null,
          category: null,
          price: null,
          note: "Part number format is valid but not found in our catalog. Our team will verify availability.",
        });
      }

      return res.json({ valid: false, error: "Invalid part number format" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/portal/cases", requireAuth, async (req, res) => {
    try {
      const sessions_list = await storage.getSessionsByCustomer((req as any).customerId);
      const sessionsWithReports = await Promise.all(
        sessions_list.map(async (session) => {
          const report = await storage.getReport(session.id);
          return { ...session, report: report || null };
        })
      );
      res.json(sessionsWithReports);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/portal/quote-requests", requireAuth, async (req, res) => {
    try {
      const cid = (req as any).customerId;
      const { items, notes, equipmentId, equipmentInfo } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "At least one part item is required" });
      }

      const validationResults = items.map((item: any) => {
        const errors: string[] = [];
        if (!item.partNumber || item.partNumber.trim().length < 2) {
          errors.push("Part number is required (min 2 characters)");
        }
        if (!item.quantity || item.quantity < 1 || item.quantity > 9999) {
          errors.push("Quantity must be between 1 and 9999");
        }
        const partNumberPattern = /^[A-Za-z0-9\-\.\/\s]{2,50}$/;
        if (item.partNumber && !partNumberPattern.test(item.partNumber.trim())) {
          errors.push("Part number contains invalid characters");
        }
        return {
          ...item,
          valid: errors.length === 0,
          errors,
        };
      });

      const validCount = validationResults.filter((r: any) => r.valid).length;
      const invalidCount = validationResults.filter((r: any) => !r.valid).length;

      if (validCount === 0) {
        return res.status(400).json({
          error: "No valid parts in the list",
          validationResults,
        });
      }

      const refNumber = `QR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const quoteRequest = await storage.createQuoteRequest({
        customerId: cid,
        equipmentId: equipmentId ? parseInt(equipmentId) : null,
        referenceNumber: refNumber,
        status: "pending_review",
        notes: notes || null,
        equipmentInfo: equipmentInfo || null,
        totalItems: items.length,
        validatedItems: validCount,
        invalidItems: invalidCount,
        adminNotes: null,
      });

      const createdItems = [];
      for (const item of validationResults) {
        const created = await storage.createQuoteRequestItem({
          quoteRequestId: quoteRequest.id,
          partNumber: item.partNumber?.trim() || "",
          description: item.description?.trim() || null,
          quantity: item.quantity || 1,
          make: item.make?.trim() || null,
          model: item.model?.trim() || null,
          serialNumber: item.serialNumber?.trim() || null,
          urgency: item.urgency || "standard",
          validationStatus: item.valid ? "validated" : "invalid",
          validationNotes: item.valid ? null : item.errors.join("; "),
        });
        createdItems.push(created);
      }

      const customer = await storage.getCustomerById(cid);
      if (customer?.email) {
        sendQuoteConfirmationEmail(customer.email, customer.firstName, refNumber, validCount, items.length).catch(err => {
          console.error("[QUOTE] Customer email send failed:", err.message);
        });

        sendQuoteNotificationToAdmin(
          `${customer.firstName} ${customer.lastName}`,
          customer.email,
          customer.phone || null,
          customer.company || null,
          refNumber,
          items.length,
          validationResults.filter((r: any) => r.valid).map((r: any) => ({
            partNumber: r.partNumber,
            description: r.description,
            quantity: r.quantity,
            make: r.make,
            urgency: r.urgency,
          })),
          equipmentInfo || null,
          notes || null
        ).catch(err => {
          console.error("[QUOTE] Admin notification send failed:", err.message);
        });
      }

      res.json({
        quoteRequest,
        items: createdItems,
        validationSummary: {
          total: items.length,
          valid: validCount,
          invalid: invalidCount,
        },
      });
    } catch (error: any) {
      console.error("Quote request error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/portal/quote-requests", requireAuth, async (req, res) => {
    try {
      const cid = (req as any).customerId;
      const quotes = await storage.getQuoteRequests(cid);
      res.json(quotes);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/portal/quote-requests/:id", requireAuth, async (req, res) => {
    try {
      const cid = (req as any).customerId;
      const qr = await storage.getQuoteRequestById(parseInt(req.params.id));
      if (!qr || qr.customerId !== cid) {
        return res.status(404).json({ error: "Quote request not found" });
      }
      const items = await storage.getQuoteRequestItems(qr.id);
      const enrichedItems = items.map((item: any) => {
        const pn = (item.partNumber || "").toUpperCase().replace(/\s+/g, "");
        const catalog = PARTS_CATALOG[item.partNumber] || PARTS_CATALOG[pn] ||
          Object.values(PARTS_CATALOG).find(p => p.partNumber.toUpperCase().replace(/\s+/g, "") === pn);
        return {
          ...item,
          catalogName: catalog?.name || null,
          catalogDescription: catalog?.description || null,
          catalogCategory: catalog?.category || null,
        };
      });
      res.json({ ...qr, items: enrichedItems });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/customer-context/:customerId", requireAuth, async (req, res) => {
    try {
      const cid = (req as any).customerId;
      if (cid !== parseInt(req.params.customerId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const customer = await storage.getCustomerById(cid);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      const equipment = await storage.getEquipment(cid);
      const serviceRequests = await storage.getServiceRequests(cid);
      const { passwordHash: _, ...safe } = customer;
      res.json({ customer: safe, equipment, serviceRequests });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const requireCrmApiKey = (req: any, res: any, next: any) => {
    const apiKey = req.headers["x-crm-api-key"];
    const validKey = process.env.CRM_SYNC_API_KEY;
    if (!validKey || apiKey !== validKey) {
      return res.status(401).json({ error: "Invalid or missing CRM API key" });
    }
    next();
  };

  app.get("/api/crm/quote-requests", requireCrmApiKey, async (_req, res) => {
    try {
      const all = await storage.getAllQuoteRequests();
      const enriched = await Promise.all(all.map(async (qr) => {
        const customer = await storage.getCustomerById(qr.customerId);
        const items = await storage.getQuoteRequestItems(qr.id);
        const { passwordHash: _, ...safeCustomer } = customer || { passwordHash: "" } as any;
        return { ...qr, customer: customer ? safeCustomer : null, items };
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/crm/quote-requests/:refOrId", requireCrmApiKey, async (req, res) => {
    try {
      const param = req.params.refOrId;
      let qr = await storage.getQuoteRequestByRef(param);
      if (!qr && /^\d+$/.test(param)) {
        qr = await storage.getQuoteRequestById(parseInt(param));
      }
      if (!qr) return res.status(404).json({ error: "Quote request not found" });
      const customer = await storage.getCustomerById(qr.customerId);
      const items = await storage.getQuoteRequestItems(qr.id);
      const { passwordHash: _, ...safeCustomer } = customer || { passwordHash: "" } as any;
      res.json({ ...qr, customer: customer ? safeCustomer : null, items });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/crm/quote-requests/:refOrId", requireCrmApiKey, async (req, res) => {
    try {
      const param = req.params.refOrId;
      let qr = await storage.getQuoteRequestByRef(param);
      if (!qr && /^\d+$/.test(param)) {
        qr = await storage.getQuoteRequestById(parseInt(param));
      }
      if (!qr) return res.status(404).json({ error: "Quote request not found" });

      const { status, adminNotes } = req.body;
      const validStatuses = ["pending_review", "quoted", "approved", "rejected", "completed", "shipped", "cancelled"];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (adminNotes !== undefined) updateData.adminNotes = adminNotes;

      const updated = await storage.updateQuoteRequest(qr.id, updateData);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/crm/invoices", requireCrmApiKey, async (req, res) => {
    try {
      const { customerEmail, customerId, amount, description, dueDate, status, serviceRequestId } = req.body;

      let cid = customerId;
      if (!cid && customerEmail) {
        const customer = await storage.getCustomerByEmail(customerEmail);
        if (!customer) return res.status(404).json({ error: `Customer not found with email: ${customerEmail}` });
        cid = customer.id;
      }
      if (!cid) return res.status(400).json({ error: "customerId or customerEmail is required" });

      const invoice = await storage.createInvoice({
        customerId: cid,
        amount: amount || "0",
        description: description || null,
        dueDate: dueDate || null,
        status: status || "pending",
        serviceRequestId: serviceRequestId || null,
      });

      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/crm/invoices/:id", requireCrmApiKey, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { amount, description, dueDate, status } = req.body;
      const updateData: any = {};
      if (amount !== undefined) updateData.amount = amount;
      if (description !== undefined) updateData.description = description;
      if (dueDate !== undefined) updateData.dueDate = dueDate;
      if (status !== undefined) updateData.status = status;
      if (status === "paid") updateData.paidAt = new Date();

      const updated = await storage.updateInvoice(id, updateData);
      if (!updated) return res.status(404).json({ error: "Invoice not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/crm/customers", requireCrmApiKey, async (_req, res) => {
    try {
      const all = await storage.getAllCustomers();
      const safe = all.map(({ passwordHash: _, ...rest }) => rest);
      res.json(safe);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/crm/customers/:emailOrId", requireCrmApiKey, async (req, res) => {
    try {
      const param = req.params.emailOrId;
      let customer;
      if (/^\d+$/.test(param)) {
        customer = await storage.getCustomerById(parseInt(param));
      } else {
        customer = await storage.getCustomerByEmail(param);
      }
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      const { passwordHash: _, ...safe } = customer;
      const equipment = await storage.getEquipment(customer.id);
      const serviceRequests = await storage.getServiceRequests(customer.id);
      const quotes = await storage.getQuoteRequests(customer.id);
      res.json({ ...safe, equipment, serviceRequests, quoteRequests: quotes });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const { language, consentGiven, provider, customerId } = req.body;

      const sessionData: any = {
        status: "intake",
        tier: "free",
        language: language || "en",
        consentGiven: consentGiven || false,
        agentProvider: provider || "heygen",
      };

      let resolvedCustomerId = customerId;
      if (resolvedCustomerId) {
        const authToken = req.headers["x-auth-token"] as string;
        const authenticatedCustomerId = authToken ? customerSessions.get(authToken) : null;
        if (!authenticatedCustomerId || authenticatedCustomerId !== resolvedCustomerId) {
          resolvedCustomerId = authenticatedCustomerId || null;
        }
      }

      if (resolvedCustomerId) {
        sessionData.customerId = resolvedCustomerId;
        try {
          const customer = await storage.getCustomerById(resolvedCustomerId);
          if (customer) {
            sessionData.customerName = `${customer.firstName} ${customer.lastName}`;
            sessionData.customerEmail = customer.email;
            sessionData.customerPhone = customer.phone || null;
            sessionData.company = customer.company || null;
          }
          const equipment = await storage.getEquipment(resolvedCustomerId);
          if (equipment.length > 0) {
            const eq = equipment[0];
            sessionData.equipmentType = eq.type || null;
            sessionData.make = eq.make || null;
            sessionData.model = eq.model || null;
            sessionData.year = eq.year || null;
            sessionData.serialNumber = eq.serialNumber || null;
            sessionData.smuHours = eq.smuHours || null;
            sessionData.location = eq.notes?.replace("Location: ", "") || null;
          }
          const srs = await storage.getServiceRequests(resolvedCustomerId);
          const openSR = srs.find(sr => sr.status === "open");
          if (openSR) {
            sessionData.problemSummary = openSR.description || null;
            sessionData.faultCodes = openSR.faultCodes || null;
          }
        } catch (ctxErr) {
          console.error("Error loading customer context for session:", ctxErr);
        }
      }

      const session = await storage.createSession(sessionData);
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
        const sessionCtx: SessionContext = {
          customerName: session.customerName,
          company: session.company,
          equipmentType: session.equipmentType,
          make: session.make,
          model: session.model,
          year: session.year,
          serialNumber: session.serialNumber,
          smuHours: session.smuHours,
          problemSummary: session.problemSummary,
          faultCodes: session.faultCodes,
          location: session.location,
        };
        for await (const chunk of streamAdminResponse(chatHistory, sessionLanguage, sessionCtx)) {
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

  app.post("/api/sessions/:id/email-transcript", requireAuth, async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

      const cid = (req as any).customerId;
      const customer = await storage.getCustomerById(cid);
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      const { transcript } = req.body;
      if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
        return res.status(400).json({ error: "Transcript data is required" });
      }

      const session = await storage.getSession(sessionId);

      const entryRows = transcript.map((entry: any, i: number) => {
        const isUser = entry.role === "user";
        const bgColor = isUser ? "#1a3a5c" : "#2a2200";
        const borderColor = isUser ? "#3b82f6" : "#FFCD11";
        const nameColor = isUser ? "#93c5fd" : "#FFCD11";
        const textColor = isUser ? "#bfdbfe" : "#ffffff";
        const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
        return `
          <tr>
            <td style="padding: 12px 16px; background: ${bgColor}; border-left: 3px solid ${borderColor}; border-radius: 6px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span style="color: ${nameColor}; font-weight: 700; font-size: 13px;">${entry.agent || (isUser ? "You" : "AI")}</span>
                <span style="color: #666; font-size: 11px;">${time}</span>
              </div>
              <p style="margin: 0; color: ${textColor}; font-size: 14px; line-height: 1.6;">${entry.text}</p>
            </td>
          </tr>
          <tr><td style="height: 8px;"></td></tr>`;
      }).join("");

      const html = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #111; border: 1px solid #333; border-radius: 8px; overflow: hidden;">
        <div style="background: #FFCD11; padding: 20px; text-align: center;">
          <h1 style="margin: 0; color: #111; font-size: 24px; letter-spacing: 4px;">AMERICAN IRON</h1>
          <p style="margin: 5px 0 0; color: #333; font-size: 14px; font-weight: bold;">AI Mechanic Analysis Transcript</p>
        </div>
        <div style="padding: 24px;">
          <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="color: #888; font-size: 12px; padding: 2px 0;">Session Date</td>
                <td style="color: #ddd; font-size: 12px; padding: 2px 0; text-align: right;">${new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" })}</td>
              </tr>
              <tr>
                <td style="color: #888; font-size: 12px; padding: 2px 0;">Customer</td>
                <td style="color: #ddd; font-size: 12px; padding: 2px 0; text-align: right;">${customer.firstName} ${customer.lastName}</td>
              </tr>
              ${session?.mechanicType ? `<tr>
                <td style="color: #888; font-size: 12px; padding: 2px 0;">Specialist</td>
                <td style="color: #FFCD11; font-size: 12px; padding: 2px 0; text-align: right;">${session.mechanicType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</td>
              </tr>` : ''}
              <tr>
                <td style="color: #888; font-size: 12px; padding: 2px 0;">Messages</td>
                <td style="color: #ddd; font-size: 12px; padding: 2px 0; text-align: right;">${transcript.length}</td>
              </tr>
            </table>
          </div>

          <h3 style="color: #FFCD11; margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 2px;">Complete Transcript</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${entryRows}
          </table>

          <div style="margin-top: 24px; padding: 16px; background: #1a1a1a; border: 1px solid #333; border-radius: 6px; text-align: center;">
            <p style="margin: 0; color: #888; font-size: 12px;">This transcript was generated by the AMERICAN IRON AI Diagnostic System.</p>
            <p style="margin: 4px 0 0; color: #666; font-size: 11px;">For follow-up questions, contact us at support@americanironus.com</p>
          </div>
        </div>
      </div>`;

      const subject = `Your AI Mechanic Analysis — AMERICAN IRON — Session ${new Date().toLocaleDateString()}`;

      if (process.env.RESEND_API_KEY) {
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || "AMERICAN IRON <noreply@americanironus.com>",
            to: [customer.email],
            subject,
            html,
          });
          console.log(`[TRANSCRIPT] Email sent via Resend to ${customer.email}`);
          return res.json({ success: true, method: "resend" });
        } catch (err: any) {
          console.error(`[TRANSCRIPT] Resend failed:`, err.message);
        }
      }

      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || "smtp.gmail.com",
            port: parseInt(process.env.SMTP_PORT || "587"),
            secure: parseInt(process.env.SMTP_PORT || "587") === 465,
            auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS || "").replace(/\s/g, "") },
            tls: { rejectUnauthorized: false },
          });
          await transporter.sendMail({
            from: `"AMERICAN IRON" <${process.env.SMTP_USER}>`,
            to: customer.email,
            subject,
            html,
          });
          console.log(`[TRANSCRIPT] Email sent via SMTP to ${customer.email}`);
          return res.json({ success: true, method: "smtp" });
        } catch (err: any) {
          console.error(`[TRANSCRIPT] SMTP failed:`, err.message);
        }
      }

      res.status(503).json({ error: "Email service unavailable" });
    } catch (error: any) {
      console.error("[TRANSCRIPT] Email error:", error);
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

  app.get("/api/avatar/available", async (req, res) => {
    try {
      const avatars = await listAvailableAvatars();
      res.json({ avatars });
    } catch (error: any) {
      console.error("List avatars error:", error);
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
