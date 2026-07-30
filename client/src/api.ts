export interface AuthStatus {
  authorized: boolean;
  locked: boolean;
  error?: string;
  remainingDailyAttempts?: number;
  remainingIpAttempts?: number;
}


function getCookie(name: string): string {
  const prefix = `${name}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : "";
}


async function readJson(response: Response): Promise<AuthStatus> {
  const payload = (await response.json().catch(() => ({}))) as AuthStatus;
  if (!response.ok && response.status !== 401 && response.status !== 423) {
    throw new Error(payload.error || `请求失败（${response.status}）`);
  }
  return payload;
}


export async function fetchAuthStatus(): Promise<AuthStatus> {
  const response = await fetch("/api/auth/status", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return readJson(response);
}


export async function login(password: string): Promise<AuthStatus> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("cloudrop_csrf"),
    },
    body: JSON.stringify({ password }),
  });
  return readJson(response);
}


export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "X-CSRFToken": getCookie("cloudrop_csrf"),
    },
  });
}

