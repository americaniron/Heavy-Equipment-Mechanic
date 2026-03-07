import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import {
  sessions, sessionMessages, sessionFiles, sessionReports,
  type Session, type InsertSession,
  type SessionMessage, type InsertSessionMessage,
  type SessionFile, type InsertSessionFile,
  type SessionReport, type InsertSessionReport,
} from "@shared/schema";

export interface IStorage {
  createSession(data: InsertSession): Promise<Session>;
  getSession(id: number): Promise<Session | undefined>;
  updateSession(id: number, data: Partial<InsertSession>): Promise<Session | undefined>;
  getSessionByShareToken(token: string): Promise<Session | undefined>;

  createMessage(data: InsertSessionMessage): Promise<SessionMessage>;
  getMessages(sessionId: number): Promise<SessionMessage[]>;

  createFile(data: InsertSessionFile): Promise<SessionFile>;
  getFiles(sessionId: number): Promise<SessionFile[]>;

  createReport(data: InsertSessionReport): Promise<SessionReport>;
  getReport(sessionId: number, reportType?: string): Promise<SessionReport | undefined>;
  getReportByShareToken(token: string): Promise<SessionReport | undefined>;
}

export class DatabaseStorage implements IStorage {
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
    if (reportType) {
      const [report] = await db.select().from(sessionReports)
        .where(eq(sessionReports.sessionId, sessionId))
        .orderBy(desc(sessionReports.createdAt));
      return report;
    }
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
