import { clearLoginCookies } from "@/lib/auth";

export async function POST() {
  await clearLoginCookies();
  return Response.json({ authenticated: false });
}
