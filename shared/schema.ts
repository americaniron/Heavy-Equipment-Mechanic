import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  company: text("company"),
  equipmentType: text("equipment_type"),
  make: text("make"),
  model: text("model"),
  year: text("year"),
  serialNumber: text("serial_number"),
  serialPrefix: text("serial_prefix"),
  smuHours: text("smu_hours"),
  problemSummary: text("problem_summary"),
  faultCodes: text("fault_codes"),
  issueStarted: text("issue_started"),
  location: text("location"),
  canSafelyShutdown: boolean("can_safely_shutdown"),
  visitType: text("visit_type").default("quick_advice"),
  mechanicType: text("mechanic_type"),
  status: text("status").default("intake").notNull(),
  agentProvider: text("agent_provider").default("heygen"),
  tier: text("tier").default("free").notNull(),
  paymentStatus: text("payment_status").default("none"),
  stripeSessionId: text("stripe_session_id"),
  shareToken: text("share_token"),
  intakeJson: jsonb("intake_json"),
  language: text("language").default("en"),
  consentGiven: boolean("consent_given").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const sessionMessages = pgTable("session_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  agentType: text("agent_type").default("admin"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const sessionFiles = pgTable("session_files", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  filePath: text("file_path").notNull(),
  uploadedAt: timestamp("uploaded_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const sessionReports = pgTable("session_reports", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  reportType: text("report_type").notNull(),
  content: jsonb("content"),
  svgDiagram: text("svg_diagram"),
  shareToken: text("share_token"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export const insertSessionMessageSchema = createInsertSchema(sessionMessages).omit({
  id: true,
  createdAt: true,
});

export const insertSessionFileSchema = createInsertSchema(sessionFiles).omit({
  id: true,
  uploadedAt: true,
});

export const insertSessionReportSchema = createInsertSchema(sessionReports).omit({
  id: true,
  createdAt: true,
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SessionMessage = typeof sessionMessages.$inferSelect;
export type InsertSessionMessage = z.infer<typeof insertSessionMessageSchema>;
export type SessionFile = typeof sessionFiles.$inferSelect;
export type InsertSessionFile = z.infer<typeof insertSessionFileSchema>;
export type SessionReport = typeof sessionReports.$inferSelect;
export type InsertSessionReport = z.infer<typeof insertSessionReportSchema>;
