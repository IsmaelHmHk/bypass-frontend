export interface SalidaParada {
    linea: string;
    destino: string;
    minutos: number;
    horaSalida?: string;
    fuente: 'EN_VIVO' | 'TEORICO';
    estado?: string;
}

export interface EstacionCatalogo {
    idEstacion: string;
    codigoParada?: string;
    nombre: string;
    latitud: number;
    longitud: number;
    accesiblePmr?: boolean;
    lineas: string[];
    estadoServicio?: string;
    proximasSalidas?: SalidaParada[];
}

export interface EstacionCercanaLocal extends EstacionCatalogo {
    distanciaMetros: number;
    minutosAndando: number;
}

export interface LineaGtfsColor {
    codigoCorto: string;
    colorHex?: string | null;
    colorTextoHex?: string | null;
}

const STORAGE_CATALOGO = 'bypass_catalogo_estaciones_v2';

export function leerCatalogoCache(): EstacionCatalogo[] {
    try {
        const raw = localStorage.getItem(STORAGE_CATALOGO);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function guardarCatalogoCache(estaciones: EstacionCatalogo[]): void {
    try {
        if (Array.isArray(estaciones)) {
            localStorage.setItem(STORAGE_CATALOGO, JSON.stringify(estaciones));
        }
    } catch {
        // Ignorar si localStorage no está disponible
    }
}

export async function cargarCatalogoEstaticoPublico(): Promise<EstacionCatalogo[]> {
    const url = '/estaciones-madrid.json';
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`[ByPass] Error cargando fichero estático | URL: ${url} | Código: HTTP ${res.status}`);
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
            console.error(`[ByPass] Formato inválido en fichero estático | URL: ${url}`);
            return [];
        }
        return data.map((d) => ({
            ...d,
            lineas: Array.isArray(d.lineas) ? d.lineas : [],
        }));
    } catch (err) {
        console.error(`[ByPass] Fallo de red cargando fichero estático | URL: ${url}`, err);
        throw err;
    }
}

export function distanciaHaversineMetros(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

export function calcularCercanasEnCliente(
    catalogo: EstacionCatalogo[],
    lat: number,
    lon: number,
    limite = 3
): EstacionCercanaLocal[] {
    return catalogo
        .filter((e) => !Number.isNaN(Number(e.latitud)) && !Number.isNaN(Number(e.longitud)))
        .map((e) => {
            const distanciaMetros = distanciaHaversineMetros(lat, lon, Number(e.latitud), Number(e.longitud));
            const minutosAndando = Math.max(1, Math.ceil(distanciaMetros / 80));
            return {
                ...e,
                lineas: Array.isArray(e.lineas) ? e.lineas : [],
                distanciaMetros,
                minutosAndando,
            };
        })
        .sort((a, b) => a.distanciaMetros - b.distanciaMetros)
        .slice(0, limite);
}

export function normalizarColorGtfs(raw?: string | null): string {
    if (!raw) return '#6E6A63';
    const limpio = raw.trim().replace(/^#/, '');
    if (/^[0-9A-Fa-f]{6}$/.test(limpio) || /^[0-9A-Fa-f]{3}$/.test(limpio)) {
        return `#${limpio.toUpperCase()}`;
    }
    return '#6E6A63';
}

export function normalizarTextoColorGtfs(raw?: string | null, fondoHex = '#6E6A63'): string {
    if (raw) {
        const limpio = raw.trim().replace(/^#/, '');
        if (/^[0-9A-Fa-f]{6}$/.test(limpio) || /^[0-9A-Fa-f]{3}$/.test(limpio)) {
            return `#${limpio.toUpperCase()}`;
        }
    }
    const hex = fondoHex.replace('#', '');
    if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return luminancia > 0.55 ? '#242424' : '#FFFFFF';
    }
    return '#FFFFFF';
}