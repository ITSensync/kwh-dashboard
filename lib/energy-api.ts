import { ENERGY_API_ORIGIN } from "@/lib/energy-config";

export async function proxyEnergyApi(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    const upstream = await fetch(new URL(path, ENERGY_API_ORIGIN), {
      ...init,
      cache: "no-store",
    });
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown network error";
    console.error("Energy API request failed:", message);

    return Response.json(
      {
        status: 502,
        message: "Tidak dapat terhubung ke layanan energi.",
      },
      { status: 502 },
    );
  }
}

export function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function badRequest(message: string) {
  return Response.json({ status: 400, message }, { status: 400 });
}
