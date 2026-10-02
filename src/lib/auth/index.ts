import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db/client";
import { z } from "zod";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? (() => {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET environment variable is required in production");
    }
    return "dev-secret-change-in-production-min-32-chars-long!!";
  })()
);

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const BCRYPT_ROUNDS = 12;

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const resetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  email_verified: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a secure random token
 */
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create an access token (short-lived)
 */
export async function createAccessToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

/**
 * Create a refresh token (long-lived) and store in database
 */
export async function createRefreshToken(userId: string, userAgent?: string, ipAddress?: string): Promise<string> {
  const token = generateToken();
  const tokenHash = await hashPassword(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await query`
    INSERT INTO user_sessions (user_id, token_hash, user_agent, ip_address, expires_at)
    VALUES (${userId}, ${tokenHash}, ${userAgent ?? null}, ${ipAddress ?? null}, ${expiresAt.toISOString()})
  `;

  return token;
}

/**
 * Verify an access token
 */
export async function verifyAccessToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type !== "access") return null;
    return { id: payload.id as string, email: payload.email as string, name: payload.name as string | null };
  } catch {
    return null;
  }
}

/**
 * Verify a refresh token and rotate it
 */
export async function verifyAndRotateRefreshToken(token: string, userAgent?: string, ipAddress?: string): Promise<{ accessToken: string; refreshToken: string; user: SessionUser } | null> {
  const { createHash } = await import("node:crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const session = await queryOne<{ id: string; user_id: string; token_hash: string; expires_at: string; revoked_at: string | null }>`
    SELECT id, user_id, token_hash, expires_at, revoked_at
    FROM user_sessions
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > NOW()
  `;

  if (!session.data) return null;

  await query`UPDATE user_sessions SET revoked_at = NOW() WHERE id = ${session.data.id}`;

  const newRefreshToken = await createRefreshToken(session.data.user_id);

  const user = await queryOne<{ id: string; email: string; name: string | null }>`
    SELECT id, email, name FROM users WHERE id = ${session.data.user_id}
  `;

  if (!user.data) return null;

  const newAccessToken = await createAccessToken({ id: user.data.id, email: user.data.email, name: user.data.name });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: { id: user.data.id, email: user.data.email, name: user.data.name },
  };
}

/**
 * Revoke all sessions for a user (logout everywhere)
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await query`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
}

/**
 * Register a new user
 */
export async function registerUser(input: RegisterInput): Promise<{ user: SessionUser; accessToken: string; refreshToken: string } | { error: string }> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password, name } = parsed.data;

  // Check if user exists
  const existing = await queryOne<{ id: string }>`
    SELECT id FROM users WHERE email = ${email.toLowerCase()}
  `;

  if (existing.data) {
    return { error: "An account with this email already exists" };
  }

  const passwordHash = await hashPassword(password);
  const verificationToken = generateToken();

  const result = await queryOne<{ id: string; email: string; name: string | null }>`
    INSERT INTO users (email, password_hash, name, verification_token)
    VALUES (${email.toLowerCase()}, ${passwordHash}, ${name ?? null}, ${verificationToken})
    RETURNING id, email, name
  `;

  if (!result.data) {
    return { error: "Failed to create account" };
  }

  const user = { id: result.data.id, email: result.data.email, name: result.data.name };
  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}

/**
 * Login a user
 */
export async function loginUser(input: LoginInput, userAgent?: string, ipAddress?: string): Promise<{ user: SessionUser; accessToken: string; refreshToken: string } | { error: string }> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password } = parsed.data;

  const user = await queryOne<{ id: string; email: string; name: string | null; password_hash: string }>`
    SELECT id, email, name, password_hash FROM users WHERE email = ${email.toLowerCase()}
  `;

  if (!user.data) {
    return { error: "Invalid email or password" };
  }

  const valid = await verifyPassword(password, user.data.password_hash);
  if (!valid) {
    return { error: "Invalid email or password" };
  }

  // Update last login
  await query`UPDATE users SET last_login_at = NOW() WHERE id = ${user.data.id}`;

  const sessionUser = { id: user.data.id, email: user.data.email, name: user.data.name };
  const accessToken = await createAccessToken(sessionUser);
  const refreshToken = await createRefreshToken(user.data.id, userAgent, ipAddress);

  return { user: sessionUser, accessToken, refreshToken };
}

/**
 * Request password reset
 */
export async function requestPasswordReset(input: { email: string }): Promise<{ success: boolean; error?: string }> {
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { email } = parsed.data;

  const user = await queryOne<{ id: string }>`
    SELECT id FROM users WHERE email = ${email.toLowerCase()}
  `;

  // Always return success to prevent email enumeration
  if (!user.data) return { success: true };

  const resetToken = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await query`
    UPDATE users
    SET reset_token = ${resetToken}, reset_token_expires = ${expiresAt.toISOString()}
    WHERE id = ${user.data.id}
  `;

  return { success: true };
}

/**
 * Reset password with token
 */
export async function resetPassword(input: { token: string; password: string }): Promise<{ success: boolean; error?: string }> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { token, password } = parsed.data;

  const user = await queryOne<{ id: string }>`
    SELECT id FROM users
    WHERE reset_token = ${token} AND reset_token_expires > NOW()
  `;

  if (!user.data) {
    return { success: false, error: "Invalid or expired reset token" };
  }

  const passwordHash = await hashPassword(password);

  await query`
    UPDATE users
    SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW()
    WHERE id = ${user.data.id}
  `;

  // Revoke all sessions
  await revokeAllSessions(user.data.id);

  return { success: true };
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const result = await queryOne<{
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
    email_verified: boolean;
  }>`
    SELECT id, email, name, avatar_url, created_at, updated_at, email_verified
    FROM users WHERE id = ${userId}
  `;

  return result.data ?? null;
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId: string, updates: { name?: string; avatar_url?: string }): Promise<User | null> {
  const result = await queryOne<{
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
    email_verified: boolean;
  }>`
    UPDATE users
    SET name = COALESCE(${updates.name ?? null}, name),
        avatar_url = COALESCE(${updates.avatar_url ?? null}, avatar_url),
        updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, email, name, avatar_url, created_at, updated_at, email_verified
  `;

  return result.data ?? null;
}

/**
 * Change password
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const user = await queryOne<{ password_hash: string }>`
    SELECT password_hash FROM users WHERE id = ${userId}
  `;

  if (!user.data) {
    return { success: false, error: "User not found" };
  }

  const valid = await verifyPassword(currentPassword, user.data.password_hash);
  if (!valid) {
    return { success: false, error: "Current password is incorrect" };
  }

  const passwordHash = await hashPassword(newPassword);
  await query`UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW() WHERE id = ${userId}`;

  // Revoke all other sessions
  await revokeAllSessions(userId);

  return { success: true };
}

/**
 * Delete user account
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  await query`DELETE FROM users WHERE id = ${userId}`;
  // Cascade deletes will handle related tables
}
