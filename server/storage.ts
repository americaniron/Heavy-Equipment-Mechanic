import { eq, desc, and } from "drizzle-orm";
import { db } from "./db";
import {
  customers, equipment, serviceRequests, workOrders,
  maintenanceSchedules, supportTickets, documents, invoices,
  sessions, sessionMessages, sessionFiles, sessionReports,
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
}

export const storage = new DatabaseStorage();
