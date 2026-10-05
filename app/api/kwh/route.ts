import { proxyEnergyApi } from "@/lib/energy-api";
import { getAuthenticatedDevice } from "@/lib/auth";

export async function GET() {
  const deviceId = await getAuthenticatedDevice();
  if (!deviceId) {
    return Response.json({ status: 401, message: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  const query = new URLSearchParams({
    device_id: deviceId,
    limit: "1",
  });

  return proxyEnergyApi(`/kwh?${query.toString()}`);
}
