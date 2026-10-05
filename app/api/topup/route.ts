import {
  badRequest,
  isDateOnly,
  proxyEnergyApi,
} from "@/lib/energy-api";
import { getAuthenticatedDevice } from "@/lib/auth";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(request: Request) {
  const deviceId = await getAuthenticatedDevice();
  if (!deviceId) {
    return Response.json({ status: 401, message: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  const incoming = new URL(request.url);
  const startDate = incoming.searchParams.get("startDate") ?? "";
  const endDate = incoming.searchParams.get("endDate") ?? "";

  if (!startDate || !endDate) {
    return badRequest("Tanggal mulai dan tanggal akhir wajib diisi.");
  }

  if (startDate && !isDateOnly(startDate)) {
    return badRequest("Tanggal mulai tidak valid.");
  }

  if (endDate && !isDateOnly(endDate)) {
    return badRequest("Tanggal akhir tidak valid.");
  }

  if (startDate && endDate && startDate > endDate) {
    return badRequest("Tanggal mulai harus sebelum atau sama dengan tanggal akhir.");
  }

  const query = new URLSearchParams({ device_id: deviceId });
  if (startDate) query.set("startDate", startDate);
  if (endDate) query.set("endDate", endDate);

  return proxyEnergyApi(`/topup?${query.toString()}`);
}

export async function POST(request: Request) {
  const deviceId = await getAuthenticatedDevice();
  if (!deviceId) {
    return Response.json({ status: 401, message: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return badRequest("Isi permintaan top up tidak valid.");
  }

  if (!isRecord(payload)) {
    return badRequest("Isi permintaan top up tidak valid.");
  }

  const amount = payload.total_topup_kwh;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return badRequest("Jumlah top up harus berupa angka lebih besar dari 0.");
  }

  return proxyEnergyApi("/topup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: deviceId,
      total_topup_kwh: amount,
    }),
  });
}

export async function DELETE(request: Request) {
  const deviceId = await getAuthenticatedDevice();
  if (!deviceId) {
    return Response.json({ status: 401, message: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  const incoming = new URL(request.url);
  const id = incoming.searchParams.get("id");

  if (!id || !/^\d+$/.test(id) || Number(id) <= 0) {
    return badRequest("ID top up tidak valid.");
  }

  const query = new URLSearchParams({
    id,
    device_id: deviceId,
  });

  return proxyEnergyApi(`/topup?${query.toString()}`, {
    method: "DELETE",
  });
}
