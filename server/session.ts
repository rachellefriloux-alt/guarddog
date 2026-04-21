import session, { type SessionOptions } from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

// Singleton store so the same session lookups work for both HTTP and WebSocket upgrades.
const sharedStore = new MemoryStore({ checkPeriod: 1000 * 60 * 60 * 24 });

export const SESSION_COOKIE_NAME = "guarddog.sid";

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET || "guarddog-development-secret";
}

export function buildSessionMiddleware() {
  const options: SessionOptions = {
    name: SESSION_COOKIE_NAME,
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    store: sharedStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  };
  return session(options);
}

export const sessionMiddleware = buildSessionMiddleware();
