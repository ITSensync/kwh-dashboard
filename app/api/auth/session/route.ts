import { getAuthenticatedDevice } from "@/lib/auth";

export async function GET() {
  const deviceId = await getAuthenticatedDevice();

  return Response.json({
    authenticated: Boolean(deviceId),
    deviceId,
  });
}
