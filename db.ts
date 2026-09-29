import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, appointments, InsertAppointment, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;

  // QUALQUER utilizador que fizer login passa a ter acesso de ADMIN por padrão:
  values.role = user.role ?? "admin";
  updateSet.role = values.role;

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listAppointments(filters?: { date?: string; coordinator?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.date) conditions.push(eq(appointments.appointmentDate, filters.date));
  if (filters?.coordinator && filters.coordinator !== "all") conditions.push(eq(appointments.coordinator, filters.coordinator));
  const query = db.select().from(appointments).orderBy(asc(appointments.appointmentDate), asc(appointments.timeSlot));
  return conditions.length ? query.where(and(...conditions)) : query;
}

export async function createAppointment(input: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(appointments).values(input);
  return Number(result[0].insertId);
}

export async function updateAppointment(id: number, input: Partial<InsertAppointment>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(appointments).set(input).where(eq(appointments.id, id));
}