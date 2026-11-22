const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

// Token guardado ÚNICAMENTE en memoria RAM (nunca en localStorage)
let accessTokenMemoria: string | null = null;

export function setAccessToken(token: string | null) {
    accessTokenMemoria = token;
}

export function getAccessToken(): string | null {
    return accessTokenMemoria;
}

async function intentarRefrescarSesion(): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });
        if (!res.ok) {
            accessTokenMemoria = null;
            return false;
        }
        const data = await res.json();
        accessTokenMemoria = data.accessToken;
        return true;
    } catch {
        accessTokenMemoria = null;
        return false;
    }
}

export async function apiFetch<T>(
    endpoint: string,
    options: RequestInit = {},
    reintentar = true
): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    if (accessTokenMemoria) {
        headers.set('Authorization', `Bearer ${accessTokenMemoria}`);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
    });

    if (response.status === 401 && reintentar && !endpoint.startsWith('/auth/')) {
        const renovado = await intentarRefrescarSesion();
        if (renovado) {
            return apiFetch<T>(endpoint, options, false);
        }
    }

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: 'Error en la petición' }));
        throw new Error(errorBody.error || `Error HTTP ${response.status}`);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}