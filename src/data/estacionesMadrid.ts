import { apiFetch } from '../api/apiClient';

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
    tieneEnlaceMetro?: boolean;
    tieneEnlaceBus?: boolean;
    ordenParada?: number | null;
    tiempoSiguienteMin?: number | null;
    lineas?: string[];
    estadoServicio?: string;
    proximasSalidas?: SalidaParada[];
}

export interface EstacionCercanaAgrupada {
    claveNombre: string;
    nombre: string;
    idEstacionPrincipal: string;
    idsEstacion: string[];
    latitud: number;
    longitud: number;
    accesiblePmr: boolean;
    tieneEnlaceMetro: boolean;
    tieneEnlaceBus: boolean;
    lineas: string[];
    esMetroIdentificado: boolean;
    modoNoDistinguible: boolean;
    distanciaMetros: number;
    minutosAndando: number;
}

export interface LineaGtfsColor {
    codigoCorto: string;
    colorHex?: string | null;
    colorTextoHex?: string | null;
}

const STORAGE_CATALOGO = 'bypass_catalogo_estaciones_api_v1';

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

export async function obtenerCatalogoDesdeApi(): Promise<EstacionCatalogo[]> {
    const datos = await apiFetch<EstacionCatalogo[]>('/catalogo/estaciones');
    if (!Array.isArray(datos)) {
        return [];
    }
    return datos.map((item) => ({
        idEstacion: String(item.idEstacion),
        codigoParada: item.codigoParada,
        nombre: String(item.nombre || '').trim(),
        latitud: Number(item.latitud),
        longitud: Number(item.longitud),
        accesiblePmr: Boolean(item.accesiblePmr),
        tieneEnlaceMetro: Boolean(item.tieneEnlaceMetro),
        tieneEnlaceBus: Boolean(item.tieneEnlaceBus),
        lineas: Array.isArray(item.lineas) ? item.lineas : [],
        estadoServicio: item.estadoServicio,
        proximasSalidas: Array.isArray(item.proximasSalidas) ? item.proximasSalidas : undefined,
    }));
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

export function esIdMetro(idEstacion: string): boolean {
    return idEstacion.trim().toLowerCase().startsWith('madrid_metro_');
}

export function calcularCercanasAgrupadas(
    catalogo: EstacionCatalogo[],
    lat: number,
    lon: number,
    limite = 3
): EstacionCercanaAgrupada[] {
    const grupos = new Map<string, EstacionCercanaAgrupada>();

    for (const est of catalogo) {
        if (!est.nombre) continue;
        const eLat = Number(est.latitud);
        const eLon = Number(est.longitud);
        if (Number.isNaN(eLat) || Number.isNaN(eLon)) continue;

        const distanciaMetros = distanciaHaversineMetros(lat, lon, eLat, eLon);
        const minutosAndando = Math.max(1, Math.ceil(distanciaMetros / 80));
        const claveNombre = est.nombre.toLowerCase().replace(/\s+/g, ' ').trim();
        const metroPorId = esIdMetro(est.idEstacion);
        const metroPorBandera = Boolean(est.tieneEnlaceMetro);
        const esMetro = metroPorId || metroPorBandera;
        const lineasItem = Array.isArray(est.lineas) ? est.lineas.filter(Boolean) : [];

        const existente = grupos.get(claveNombre);
        if (!existente) {
            grupos.set(claveNombre, {
                claveNombre,
                nombre: est.nombre,
                idEstacionPrincipal: est.idEstacion,
                idsEstacion: [est.idEstacion],
                latitud: eLat,
                longitud: eLon,
                accesiblePmr: Boolean(est.accesiblePmr),
                tieneEnlaceMetro: esMetro,
                tieneEnlaceBus: Boolean(est.tieneEnlaceBus),
                lineas: [...lineasItem],
                esMetroIdentificado: esMetro,
                modoNoDistinguible: !esMetro && lineasItem.length === 0,
                distanciaMetros,
                minutosAndando,
            });
        } else {
            if (!existente.idsEstacion.includes(est.idEstacion)) {
                existente.idsEstacion.push(est.idEstacion);
            }
            for (const l of lineasItem) {
                if (!existente.lineas.includes(l)) {
                    existente.lineas.push(l);
                }
            }
            existente.accesiblePmr = existente.accesiblePmr || Boolean(est.accesiblePmr);
            existente.tieneEnlaceMetro = existente.tieneEnlaceMetro || esMetro;
            existente.tieneEnlaceBus = existente.tieneEnlaceBus || Boolean(est.tieneEnlaceBus);
            existente.esMetroIdentificado = existente.tieneEnlaceMetro;

            if (distanciaMetros < existente.distanciaMetros) {
                existente.distanciaMetros = distanciaMetros;
                existente.minutosAndando = minutosAndando;
                existente.idEstacionPrincipal = est.idEstacion;
                existente.latitud = eLat;
                existente.longitud = eLon;
            }

            existente.modoNoDistinguible =
                !existente.esMetroIdentificado && existente.lineas.length === 0;
        }
    }

    return Array.from(grupos.values())
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