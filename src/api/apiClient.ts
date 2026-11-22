const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const API_BASE_URL = rawApiUrl || '/api/v1';

let accessTokenMemoria: string | null = null;

export function setAccessToken(token: string | null) {
    accessTokenMemoria = token;
}

export function getAccessToken(): string | null {
    return accessTokenMemoria;
}

async function intentarRefrescarSesion(): Promise<boolean> {
    const refreshUrl = `${API_BASE_URL}/auth/refresh`;
    try {
        const res = await fetch(refreshUrl, {
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
    } catch (err) {
        console.error(`[ByPass API] Fallo al refrescar sesión | URL: ${refreshUrl} | Error: RED`, err);
        accessTokenMemoria = null;
        return false;
    }
}

export async function apiFetch<T>(
    endpoint: string,
    options: RequestInit = {},
    reintentar = true
): Promise<T> {
    const normalEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${API_BASE_URL}${normalEndpoint}`;

    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    if (accessTokenMemoria) {
        headers.set('Authorization', `Bearer ${accessTokenMemoria}`);
    }

    let response: Response;
    try {
        response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include',
        });
    } catch (networkErr) {
        console.error(`[ByPass API] Error de red | URL: ${url} | Código: NETWORK_ERROR`, networkErr);
        throw new Error('Error de red al conectar con el servidor');
    }

    if (response.status === 401 && reintentar && !normalEndpoint.startsWith('/auth/')) {
        const renovado = await intentarRefrescarSesion();
        if (renovado) {
            return apiFetch<T>(normalEndpoint, options, false);
        }
    }

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: 'Error en la petición' }));
        console.error(
            `[ByPass API] Petición fallida | URL: ${url} | Código: HTTP ${response.status}`,
            errorBody
        );
        throw new Error(errorBody.error || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}