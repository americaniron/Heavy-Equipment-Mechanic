import { eq, desc, and, like, sql } from "drizzle-orm";
import { db } from "./db";
import {
  customers, equipment, serviceRequests, workOrders,
  maintenanceSchedules, supportTickets, documents, invoices,
  sessions, sessionMessages, sessionFiles, sessionReports,
  verificationCodes, visitLogs, quoteRequests, quoteRequestItems,
  type Customer, type InsertCustomer,
  type Equipment, type InsertEquipment,
  type ServiceRequest, type InsertServiceRequest,
  type WorkOrder, type InsertWorkOrder,
  type MaintenanceSchedule, type InsertMaintenanceSchedule,
  type SupportTicket, type InsertSupportTicket,
  type Document, type InsertDocument,
  type Invoice, type InsertInvoice,
  type Session, type InsertSession,
  type SessionMessage, type InsertSessionMessage,
  type SessionFile, type InsertSessionFile,
  type SessionReport, type InsertSessionReport,
  type VerificationCode, type InsertVerificationCode,
  type VisitLog, type InsertVisitLog,
  type QuoteRequest, type InsertQuoteRequest,
  type QuoteRequestItem, type InsertQuoteRequestItem,
} from "@shared/schema";

export interface IStorage {
  createCustomer(data: InsertCustomer): Promise<Customer>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  getCustomerById(id: number): Promise<Customer | undefined>;
  updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined>;

  createEquipment(data: InsertEquipment): Promise<Equipment>;
  getEquipment(customerId: number): Promise<Equipment[]>;
  getEquipmentById(id: number): Promise<Equipment | undefined>;
  updateEquipment(id: number, data: Partial<InsertEquipment>): Promise<Equipment | undefined>;
  deleteEquipment(id: number): Promise<void>;

  createServiceRequest(data: InsertServiceRequest): Promise<ServiceRequest>;
  getServiceRequests(customerId: number): Promise<ServiceRequest[]>;
  getServiceRequestById(id: number): Promise<ServiceRequest | undefined>;
  updateServiceRequest(id: number, data: Partial<InsertServiceRequest>): Promise<ServiceRequest | undefined>;

  createWorkOrder(data: InsertWorkOrder): Promise<WorkOrder>;
  getWorkOrders(customerId: number): Promise<WorkOrder[]>;

  createMaintenanceSchedule(data: InsertMaintenanceSchedule): Promise<MaintenanceSchedule>;
  getMaintenanceSchedules(customerId: number): Promise<MaintenanceSchedule[]>;
  updateMaintenanceSchedule(id: number, data: Partial<InsertMaintenanceSchedule>): Promise<MaintenanceSchedule | undefined>;

  createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket>;
  getSupportTickets(customerId: number): Promise<SupportTicket[]>;
  updateSupportTicket(id: number, data: Partial<InsertSupportTicket>): Promise<SupportTicket | undefined>;

  createDocument(data: InsertDocument): Promise<Document>;
  getDocuments(customerId: number): Promise<Document[]>;

  createInvoice(data: InsertInvoice): Promise<Invoice>;
  getInvoices(customerId: number): Promise<Invoice[]>;
  updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;

  createSession(data: InsertSession): Promise<Session>;
  getSession(id: number): Promise<Session | undefined>;
  updateSession(id: number, data: Partial<InsertSession>): Promise<Session | undefined>;
  getSessionByShareToken(token: string): Promise<Session | undefined>;
  getSessionsByCustomer(customerId: number): Promise<Session[]>;

  createMessage(data: InsertSessionMessage): Promise<SessionMessage>;
  getMessages(sessionId: number): Promise<SessionMessage[]>;

  createFile(data: InsertSessionFile): Promise<SessionFile>;
  getFiles(sessionId: number): Promise<SessionFile[]>;

  createReport(data: InsertSessionReport): Promise<SessionReport>;
  getReport(sessionId: number, reportType?: string): Promise<SessionReport | undefined>;
  getReportByShareToken(token: string): Promise<SessionReport | undefined>;

  createVerificationCode(data: InsertVerificationCode): Promise<VerificationCode>;
  getVerificationCode(target: string, code: string): Promise<VerificationCode | undefined>;
  getLatestVerificationForTarget(target: string): Promise<VerificationCode | undefined>;
  markVerified(id: number): Promise<void>;

  createVisitLog(data: InsertVisitLog): Promise<VisitLog>;
  getAllVisitLogs(): Promise<VisitLog[]>;
  getVisitLogBySession(sessionId: number): Promise<VisitLog | undefined>;

  createQuoteRequest(data: InsertQuoteRequest): Promise<QuoteRequest>;
  getQuoteRequests(customerId: number): Promise<QuoteRequest[]>;
  getQuoteRequestById(id: number): Promise<QuoteRequest | undefined>;
  getQuoteRequestByRef(referenceNumber: string): Promise<QuoteRequest | undefined>;
  updateQuoteRequest(id: number, data: Partial<InsertQuoteRequest>): Promise<QuoteRequest | undefined>;
  getAllQuoteRequests(): Promise<QuoteRequest[]>;

  createQuoteRequestItem(data: InsertQuoteRequestItem): Promise<QuoteRequestItem>;
  getQuoteRequestItems(quoteRequestId: number): Promise<QuoteRequestItem[]>;
  updateQuoteRequestItem(id: number, data: Partial<InsertQuoteRequestItem>): Promise<QuoteRequestItem | undefined>;

  getAllSessions(): Promise<Session[]>;
  getAllCustomers(): Promise<Customer[]>;
  getSessionWithMessages(sessionId: number): Promise<{ session: Session; messages: SessionMessage[]; report: SessionReport | undefined }>;
}

export class DatabaseStorage implements IStorage {
  async createCustomer(data: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(data).returning();
    return customer;
  }
  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.email, email.toLowerCase()));
    return customer;
  }
  async getCustomerById(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }
  async updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [customer] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
    return customer;
  }

  async createEquipment(data: InsertEquipment): Promise<Equipment> {
    const [item] = await db.insert(equipment).values(data).returning();
    return item;
  }
  async getEquipment(customerId: number): Promise<Equipment[]> {
    return db.select().from(equipment).where(eq(equipment.customerId, customerId)).orderBy(desc(equipment.createdAt));
  }
  async getEquipmentById(id: number): Promise<Equipment | undefined> {
    const [item] = await db.select().from(equipment).where(eq(equipment.id, id));
    return item;
  }
  async updateEquipment(id: number, data: Partial<InsertEquipment>): Promise<Equipment | undefined> {
    const [item] = await db.update(equipment).set(data).where(eq(equipment.id, id)).returning();
    return item;
  }
  async deleteEquipment(id: number): Promise<void> {
    await db.delete(equipment).where(eq(equipment.id, id));
  }

  async createServiceRequest(data: InsertServiceRequest): Promise<ServiceRequest> {
    const [sr] = await db.insert(serviceRequests).values(data).returning();
    return sr;
  }
  async getServiceRequests(customerId: number): Promise<ServiceRequest[]> {
    return db.select().from(serviceRequests).where(eq(serviceRequests.customerId, customerId)).orderBy(desc(serviceRequests.createdAt));
  }
  async getServiceRequestById(id: number): Promise<ServiceRequest | undefined> {
    const [sr] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
    return sr;
  }
  async updateServiceRequest(id: number, data: Partial<InsertServiceRequest>): Promise<ServiceRequest | undefined> {
    const [sr] = await db.update(serviceRequests).set(data).where(eq(serviceRequests.id, id)).returning();
    return sr;
  }

  async createWorkOrder(data: InsertWorkOrder): Promise<WorkOrder> {
    const [wo] = await db.insert(workOrders).values(data).returning();
    return wo;
  }
  async getWorkOrders(customerId: number): Promise<WorkOrder[]> {
    return db.select().from(workOrders).where(eq(workOrders.customerId, customerId)).orderBy(desc(workOrders.createdAt));
  }

  async createMaintenanceSchedule(data: InsertMaintenanceSchedule): Promise<MaintenanceSchedule> {
    const [ms] = await db.insert(maintenanceSchedules).values(data).returning();
    return ms;
  }
  async getMaintenanceSchedules(customerId: number): Promise<MaintenanceSchedule[]> {
    return db.select().from(maintenanceSchedules).where(eq(maintenanceSchedules.customerId, customerId)).orderBy(desc(maintenanceSchedules.createdAt));
  }
  async updateMaintenanceSchedule(id: number, data: Partial<InsertMaintenanceSchedule>): Promise<MaintenanceSchedule | undefined> {
    const [ms] = await db.update(maintenanceSchedules).set(data).where(eq(maintenanceSchedules.id, id)).returning();
    return ms;
  }

  async createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket> {
    const [ticket] = await db.insert(supportTickets).values(data).returning();
    return ticket;
  }
  async getSupportTickets(customerId: number): Promise<SupportTicket[]> {
    return db.select().from(supportTickets).where(eq(supportTickets.customerId, customerId)).orderBy(desc(supportTickets.createdAt));
  }
  async updateSupportTicket(id: number, data: Partial<InsertSupportTicket>): Promise<SupportTicket | undefined> {
    const [ticket] = await db.update(supportTickets).set(data).where(eq(supportTickets.id, id)).returning();
    return ticket;
  }

  async createDocument(data: InsertDocument): Promise<Document> {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
  }
  async getDocuments(customerId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.customerId, customerId)).orderBy(desc(documents.createdAt));
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [inv] = await db.insert(invoices).values(data).returning();
    return inv;
  }
  async getInvoices(customerId: number): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.customerId, customerId)).orderBy(desc(invoices.createdAt));
  }
  async updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [inv] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return inv;
  }

  async createSession(data: InsertSession): Promise<Session> {
    const [session] = await db.insert(sessions).values(data).returning();
    return session;
  }
  async getSession(id: number): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session;
  }
  async updateSession(id: number, data: Partial<InsertSession>): Promise<Session | undefined> {
    const [session] = await db.update(sessions).set(data).where(eq(sessions.id, id)).returning();
    return session;
  }
  async getSessionByShareToken(token: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.shareToken, token));
    return session;
  }
  async getSessionsByCustomer(customerId: number): Promise<Session[]> {
    return db.select().from(sessions).where(eq(sessions.customerId, customerId)).orderBy(desc(sessions.createdAt));
  }

  async createMessage(data: InsertSessionMessage): Promise<SessionMessage> {
    const [message] = await db.insert(sessionMessages).values(data).returning();
    return message;
  }
  async getMessages(sessionId: number): Promise<SessionMessage[]> {
    return db.select().from(sessionMessages).where(eq(sessionMessages.sessionId, sessionId)).orderBy(sessionMessages.createdAt);
  }

  async createFile(data: InsertSessionFile): Promise<SessionFile> {
    const [file] = await db.insert(sessionFiles).values(data).returning();
    return file;
  }
  async getFiles(sessionId: number): Promise<SessionFile[]> {
    return db.select().from(sessionFiles).where(eq(sessionFiles.sessionId, sessionId));
  }

  async createReport(data: InsertSessionReport): Promise<SessionReport> {
    const [report] = await db.insert(sessionReports).values(data).returning();
    return report;
  }
  async getReport(sessionId: number, reportType?: string): Promise<SessionReport | undefined> {
    const [report] = await db.select().from(sessionReports)
      .where(eq(sessionReports.sessionId, sessionId))
      .orderBy(desc(sessionReports.createdAt));
    return report;
  }
  async getReportByShareToken(token: string): Promise<SessionReport | undefined> {
    const [report] = await db.select().from(sessionReports).where(eq(sessionReports.shareToken, token));
    return report;
  }

  async createVerificationCode(data: InsertVerificationCode): Promise<VerificationCode> {
    const [code] = await db.insert(verificationCodes).values(data).returning();
    return code;
  }
  async getVerificationCode(target: string, code: string): Promise<VerificationCode | undefined> {
    const [vc] = await db.select().from(verificationCodes)
      .where(and(
        eq(verificationCodes.target, target.toLowerCase()),
        eq(verificationCodes.code, code),
        eq(verificationCodes.verified, false)
      ))
      .orderBy(desc(verificationCodes.createdAt));
    return vc;
  }
  async getLatestVerificationForTarget(target: string): Promise<VerificationCode | undefined> {
    const [vc] = await db.select().from(verificationCodes)
      .where(and(
        eq(verificationCodes.target, target.toLowerCase()),
        eq(verificationCodes.verified, true)
      ))
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);
    return vc;
  }
  async markVerified(id: number): Promise<void> {
    await db.update(verificationCodes).set({ verified: true }).where(eq(verificationCodes.id, id));
  }

  async createVisitLog(data: InsertVisitLog): Promise<VisitLog> {
    const [log] = await db.insert(visitLogs).values(data).returning();
    return log;
  }
  async getAllVisitLogs(): Promise<VisitLog[]> {
    return db.select().from(visitLogs).orderBy(desc(visitLogs.createdAt));
  }
  async getVisitLogBySession(sessionId: number): Promise<VisitLog | undefined> {
    const [log] = await db.select().from(visitLogs).where(eq(visitLogs.sessionId, sessionId));
    return log;
  }

  async createQuoteRequest(data: InsertQuoteRequest): Promise<QuoteRequest> {
    const [qr] = await db.insert(quoteRequests).values(data).returning();
    return qr;
  }
  async getQuoteRequests(customerId: number): Promise<QuoteRequest[]> {
    return db.select().from(quoteRequests).where(eq(quoteRequests.customerId, customerId)).orderBy(desc(quoteRequests.createdAt));
  }
  async getQuoteRequestById(id: number): Promise<QuoteRequest | undefined> {
    const [qr] = await db.select().from(quoteRequests).where(eq(quoteRequests.id, id));
    return qr;
  }
  async getQuoteRequestByRef(referenceNumber: string): Promise<QuoteRequest | undefined> {
    const [qr] = await db.select().from(quoteRequests).where(eq(quoteRequests.referenceNumber, referenceNumber));
    return qr;
  }
  async updateQuoteRequest(id: number, data: Partial<InsertQuoteRequest>): Promise<QuoteRequest | undefined> {
    const [qr] = await db.update(quoteRequests).set({ ...data, updatedAt: new Date() }).where(eq(quoteRequests.id, id)).returning();
    return qr;
  }
  async getAllQuoteRequests(): Promise<QuoteRequest[]> {
    return db.select().from(quoteRequests).orderBy(desc(quoteRequests.createdAt));
  }

  async createQuoteRequestItem(data: InsertQuoteRequestItem): Promise<QuoteRequestItem> {
    const [item] = await db.insert(quoteRequestItems).values(data).returning();
    return item;
  }
  async getQuoteRequestItems(quoteRequestId: number): Promise<QuoteRequestItem[]> {
    return db.select().from(quoteRequestItems).where(eq(quoteRequestItems.quoteRequestId, quoteRequestId)).orderBy(quoteRequestItems.id);
  }
  async updateQuoteRequestItem(id: number, data: Partial<InsertQuoteRequestItem>): Promise<QuoteRequestItem | undefined> {
    const [item] = await db.update(quoteRequestItems).set(data).where(eq(quoteRequestItems.id, id)).returning();
    return item;
  }

  async getAllSessions(): Promise<Session[]> {
    return db.select().from(sessions).orderBy(desc(sessions.createdAt));
  }
  async getAllCustomers(): Promise<Customer[]> {
    return db.select().from(customers).orderBy(desc(customers.createdAt));
  }
  async getSessionWithMessages(sessionId: number): Promise<{ session: Session; messages: SessionMessage[]; report: SessionReport | undefined }> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");
    const messages = await this.getMessages(sessionId);
    const report = await this.getReport(sessionId);
    return { session, messages, report };
  }
}

export const storage = new DatabaseStorage();
