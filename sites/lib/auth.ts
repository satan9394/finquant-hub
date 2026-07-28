const USER_EMAIL_HEADER = "oai-authenticated-user-email";

function validEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function ownerIdFromRequest(request: Request): Promise<string | null> {
  const email = request.headers.get(USER_EMAIL_HEADER)?.trim().toLowerCase() ?? "";
  if (!email || !validEmail(email)) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `oai:${hash}`;
}

export function authenticationRequired(): Response {
  return Response.json({ error: "登录后才能访问或修改已保存记录" }, { status: 401 });
}
