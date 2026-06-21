import { Router } from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "whatsapp-gateway-secret-change-me";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export class AuthManager {
  private users = new Map<string, User>();
  private byEmail = new Map<string, string>(); // email → userId

  // Simple in-memory password hash (use bcrypt in production)
  private hash(password: string): string {
    // Simple hash for demo — swap for bcrypt in production
    return Buffer.from(password).toString("base64");
  }

  private verify(password: string, hash: string): boolean {
    return this.hash(password) === hash;
  }

  register(name: string, email: string, password: string): { user: Omit<User, "passwordHash">; token: string } | { error: string } {
    if (this.byEmail.has(email)) {
      return { error: "Email already registered" };
    }
    const id = randomUUID();
    const user: User = {
      id,
      name,
      email,
      passwordHash: this.hash(password),
      createdAt: new Date(),
    };
    this.users.set(id, user);
    this.byEmail.set(email, id);

    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: "30d" });
    const { passwordHash: _, ...userPublic } = user;
    return { user: userPublic, token };
  }

  login(email: string, password: string): { user: Omit<User, "passwordHash">; token: string } | { error: string } {
    const userId = this.byEmail.get(email);
    if (!userId) return { error: "Invalid credentials" };
    const user = this.users.get(userId)!;
    if (!this.verify(password, user.passwordHash)) return { error: "Invalid credentials" };

    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
    const { passwordHash: _, ...userPublic } = user;
    return { user: userPublic, token };
  }

  verifyToken(token: string): { userId: string } | null {
    try {
      return jwt.verify(token, JWT_SECRET) as { userId: string };
    } catch {
      return null;
    }
  }

  getUser(userId: string): Omit<User, "passwordHash"> | null {
    const user = this.users.get(userId);
    if (!user) return null;
    const { passwordHash: _, ...pub } = user;
    return pub;
  }
}

// JWT middleware factory
export function authMiddleware(am: AuthManager) {
  return (req: any, res: any, next: any) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization header required" });
    }
    const token = auth.slice(7);
    const payload = am.verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.userId = payload.userId;
    next();
  };
}

export function authRoutes(am: AuthManager) {
  const router = Router();

  // POST /api/auth/register
  router.post("/register", (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, password required" });
    }
    const result = am.register(name, email, password);
    if ("error" in result) {
      return res.status(409).json({ error: result.error });
    }
    res.status(201).json(result);
  });

  // POST /api/auth/login
  router.post("/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email, password required" });
    }
    const result = am.login(email, password);
    if ("error" in result) {
      return res.status(401).json({ error: result.error });
    }
    res.json(result);
  });

  // GET /api/auth/me
  const mw = authMiddleware(am);
  router.get("/me", mw, (req: any, res) => {
    const user = am.getUser(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  });

  return router;
}