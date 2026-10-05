import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { DEVICE_IDS } from "@/lib/energy-config";

export const SESSION_COOKIE = "sensync-session";
export const DEVICE_COOKIE = "sensync-device";
export const SESSION_MAX_AGE = 60 * 60 * 12;

const LOGIN_USERNAME = "sensync";
const LOGIN_PASSWORD = "makanminggu12";

function signingSecret() {
  const secret = process.env.KWH_AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("KWH_AUTH_SECRET must contain at least 32 characters.");
  }

  return secret;
}

function sign(value: string) {
  return createHmac("sha256", signingSecret())
    .update(value)
    .digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isValidLogin(username: string, password: string) {
  return (
    safeEqual(username, LOGIN_USERNAME) &&
    safeEqual(password, LOGIN_PASSWORD)
  );
}

export function isAllowedDevice(deviceId: string): boolean {
  return DEVICE_IDS.some((allowedDevice) => allowedDevice === deviceId);
}

function createSessionToken() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  return `${expiresAt}.${sign(`sensync:${expiresAt}`)}`;
}

function isValidSessionToken(token: string | undefined) {
  if (!token) {
    return false;
  }

  const [expiresAtText, signature, extra] = token.split(".");
  const expiresAt = Number(expiresAtText);

  if (
    extra !== undefined ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000) ||
    !signature
  ) {
    return false;
  }

  return safeEqual(signature, sign(`sensync:${expiresAt}`));
}

export async function getAuthenticatedDevice() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const deviceId = cookieStore.get(DEVICE_COOKIE)?.value;

  if (!isValidSessionToken(session) || !deviceId || !isAllowedDevice(deviceId)) {
    return null;
  }

  return deviceId;
}

export async function setLoginCookies(deviceId: string) {
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";

  cookieStore.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  cookieStore.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearLoginCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(DEVICE_COOKIE);
}
