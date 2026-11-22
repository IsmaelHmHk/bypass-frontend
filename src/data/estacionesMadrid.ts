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

export interface TramoRutaApi {
    orden: number;
    tipo: string;
    operador: string;
    linea: string;
    origen: string;
    destino: string;
    duracionMin: number;
    esperaMin: number;
    fuenteDato: string;
    estado: string;
    accesiblePmr: boolean;
    paradasIntermedias?: string[];
}

export interface OpcionRutaApi {
    idRuta: string;
    etiqueta: string;
    duracionTotalMin: number;
    horaSalidaEstimada?: string;
    horaLlegadaEstimada: string;
    numTransbordos: number;
    accesiblePmr: boolean;
    fiabilidad: string;
    diferenciaMin: number | null;
    explicacion: string;
    tramos: TramoRutaApi[];
}

export interface RespuestaRutaApi {
    origen: { idEstacion: string; nombre: string };
    destino: { idEstacion: string; nombre: string };
    hayAlertaBypass: boolean;
    mensajeBypass: string | null;
    rutaRecomendada: OpcionRutaApi | null;
    alternativas: OpcionRutaApi[];
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
export interface LineaGtfsColor {
    codigoCorto: string;
    colorHex?: string | null;
    colorTextoHex?: string | null;
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