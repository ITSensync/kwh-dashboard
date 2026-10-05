import {
  isAllowedDevice,
  isValidLogin,
  setLoginCookies,
} from "@/lib/auth";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { message: "Isi formulir masuk tidak valid." },
      { status: 400 },
    );
  }

  if (!isRecord(payload)) {
    return Response.json(
      { message: "Isi formulir masuk tidak valid." },
      { status: 400 },
    );
  }

  const { username, password, deviceId } = payload;
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    typeof deviceId !== "string" ||
    !isAllowedDevice(deviceId)
  ) {
    return Response.json(
      { message: "Nama pengguna, kata sandi, atau perangkat tidak valid." },
      { status: 400 },
    );
  }

  if (!isValidLogin(username, password)) {
    return Response.json(
      { message: "Nama pengguna atau kata sandi tidak sesuai." },
      { status: 401 },
    );
  }

  await setLoginCookies(deviceId);
  return Response.json({ authenticated: true, deviceId });
}
