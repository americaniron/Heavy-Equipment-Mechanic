import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  company: text("company"),
  phone: text("phone"),
  role: text("role").default("user").notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type"),
  make: text("make"),
  model: text("model"),
  year: text("year"),
  serialNumber: text("serial_number"),
  smuHours: text("smu_hours"),
  warrantyExpiry: text("warranty_expiry"),
  notes: text("notes"),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const serviceRequests = pgTable("service_requests", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  equipmentId: integer("equipment_id").references(() => equipment.id),
  sessionId: integer("session_id").references(() => sessions.id),
  type: text("type").default("diagnostic").notNull(),
  status: text("status").default("open").notNull(),
  priority: text("priority").default("normal").notNull(),
  description: text("description"),
  faultCodes: text("fault_codes"),
  assignedMechanic: text("assigned_mechanic"),
  estimatedCost: text("estimated_cost"),
  diagnosisResult: jsonb("diagnosis_result"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const workOrders = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  serviceRequestId: integer("service_request_id").notNull().references(() => serviceRequests.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  status: text("status").default("pending").notNull(),
  technicianNotes: text("technician_notes"),
  laborHours: text("labor_hours"),
  partsUsed: jsonb("parts_used"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const maintenanceSchedules = pgTable("maintenance_schedules", {
  id: serial("id").primaryKey(),
  equipmentId: integer("equipment_id").notNull().references(() => equipment.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  serviceType: text("service_type").notNull(),
  intervalHours: text("interval_hours"),
  lastServiceDate: text("last_service_date"),
  nextServiceDate: text("next_service_date"),
  status: text("status").default("scheduled").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  description: text("description"),
  status: text("status").default("open").notNull(),
  priority: text("priority").default("normal").notNull(),
  category: text("category"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  equipmentId: integer("equipment_id").references(() => equipment.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  filePath: text("file_path"),
  fileSize: text("file_size"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  serviceRequestId: integer("service_request_id").references(() => serviceRequests.id),
  amount: text("amount"),
  status: text("status").default("pending").notNull(),
  dueDate: text("due_date"),
  paidAt: timestamp("paid_at"),
  description: text("description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
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

export const verificationCodes = pgTable("verification_codes", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  target: text("target").notNull(),
  targetType: text("target_type").notNull(),
  code: text("code").notNull(),
  verified: boolean("verified").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const visitLogs = pgTable("visit_logs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  company: text("company"),
  equipmentType: text("equipment_type"),
  make: text("make"),
  model: text("model"),
  year: text("year"),
  serialNumber: text("serial_number"),
  problemSummary: text("problem_summary"),
  faultCodes: text("fault_codes"),
  visitType: text("visit_type"),
  mechanicType: text("mechanic_type"),
  status: text("status").default("completed").notNull(),
  emailVerified: boolean("email_verified").default(false),
  phoneVerified: boolean("phone_verified").default(false),
  reportData: jsonb("report_data"),
  conversationSummary: text("conversation_summary"),
  language: text("language").default("en"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertVerificationCodeSchema = createInsertSchema(verificationCodes).omit({ id: true, createdAt: true });
export const insertVisitLogSchema = createInsertSchema(visitLogs).omit({ id: true, createdAt: true });

export type VerificationCode = typeof verificationCodes.$inferSelect;
export type InsertVerificationCode = z.infer<typeof insertVerificationCodeSchema>;
export type VisitLog = typeof visitLogs.$inferSelect;
export type InsertVisitLog = z.infer<typeof insertVisitLogSchema>;

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true, createdAt: true });
export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({ id: true, createdAt: true });
export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({ id: true, createdAt: true });
export const insertMaintenanceScheduleSchema = createInsertSchema(maintenanceSchedules).omit({ id: true, createdAt: true });
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true });
export const insertSessionMessageSchema = createInsertSchema(sessionMessages).omit({ id: true, createdAt: true });
export const insertSessionFileSchema = createInsertSchema(sessionFiles).omit({ id: true, uploadedAt: true });
export const insertSessionReportSchema = createInsertSchema(sessionReports).omit({ id: true, createdAt: true });

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type WorkOrder = typeof workOrders.$inferSelect;
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;
export type InsertMaintenanceSchedule = z.infer<typeof insertMaintenanceScheduleSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SessionMessage = typeof sessionMessages.$inferSelect;
export type InsertSessionMessage = z.infer<typeof insertSessionMessageSchema>;
export type SessionFile = typeof sessionFiles.$inferSelect;
export type InsertSessionFile = z.infer<typeof insertSessionFileSchema>;
export type SessionReport = typeof sessionReports.$inferSelect;
export type InsertSessionReport = z.infer<typeof insertSessionReportSchema>;
