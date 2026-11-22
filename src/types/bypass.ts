export interface Linea {
    idLinea: string;
    codigoCorto: string;
    nombreLargo: string;
    colorHex: string;
}

export interface EstacionParada {
    idEstacion: string;
    codigoParada?: string;
    nombre: string;
    ordenParada: number | null;
    tiempoSiguienteMin: number | null;
    latitud: number;
    longitud: number;
    accesiblePmr?: boolean;
    tieneEnlaceMetro: boolean;
    tieneEnlaceBus: boolean;
}

export interface ParadaCercana {
    idEstacion: string;
    codigoParada: string;
    nombre: string;
    operadorPrincipal: string;
    latitud: number;
    longitud: number;
    accesiblePmr: boolean;
    distanciaMetros: number;
    minutosAndando: number;
    lineas: string[];
}

export interface TrenActivo {
    idTren: string;
    idLinea: string;
    destino: string;
    numVagones: number;
    estado: 'EN_HORA' | 'RETRASADO' | 'DETENIDO';
    minutosRetraso: number;
    fuenteDato: 'EN_VIVO_GTFS_RT' | 'TEORICO_DEGRADADO';
    antiguedadSegundos: number;
    ultimaActualizacion: string;
}

export interface VagonEstado {
    numeroVagon: number;
    nivelSaturacion: 'SIN_DATOS' | 'VACIO' | 'MODERADO' | 'LLENO' | 'COLAPSADO';
    scorePonderado: number;
    actualizadoEn: string;
}

export interface ReporteIncidencia {
    idReporte: number;
    autor: string;
    trustScoreAutor: number;
    idLinea: string | null;
    idEstacion: string | null;
    idTren: string | null;
    tipoIncidencia: string;
    descripcion: string | null;
    pesoConfianza: number;
    estadoVerificacion: 'PENDIENTE' | 'CONFIRMADO' | 'DESCARTADO';
    creadoEn: string;
    expiraEn: string;
}

export interface AuthUsuario {
    accessToken: string;
    expiresInSeconds: number;
    idUsuario: number;
    nombre: string;
    rol: 'VIAJERO' | 'MODERADOR' | 'ADMIN';
    trustScore: number;
}

export interface PasoRuta {
    idLinea: string;
    codigoLinea: string;
    estacionOrigen: string;
    estacionDestino: string;
    tiempoEstimadoMin: number;
    lineaConIncidencias: boolean;
}

export interface AlternativaRuta {
    idAlternativa: number;
    origen: string;
    destino: string;
    modoTransporte: string;
    lineaAlternativa: string;
    tiempoEstimadoMin: number;
    instrucciones: string;
}

export interface RutaCalculada {
    tipoRuta: string;
    tiempoTotalMin: number;
    transbordos: number;
    evitaIncidencias: boolean;
    pasos: PasoRuta[];
    alternativasIntermodales: AlternativaRuta[];
}

export interface TrayectoFavorito {
    id: string;
    etiqueta: string;
    origenId: string;
    origenNombre: string;
    destinoId: string;
    destinoNombre: string;
}
export interface TramoRuta {
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
    paradasIntermedias: string[];
}

export interface RutaOpcion {
    idRuta: string;
    etiqueta: string;
    duracionTotalMin: number;
    horaLlegadaEstimada: string;
    numTransbordos: number;
    accesiblePmr: boolean;
    fiabilidad: string;
    diferenciaMin: number | null;
    explicacion: string;
    tramos: TramoRuta[];
}

export interface RutaBusqueda {
    origen: { idEstacion: string; nombre: string };
    destino: { idEstacion: string; nombre: string };
    hayAlertaBypass: boolean;
    mensajeBypass: string | null;
    rutaRecomendada: RutaOpcion | null;
    alternativas: RutaOpcion[];
}

export interface EstadoRutaHabitual {
    id: string;
    nombreOrigen: string;
    nombreDestino: string;
    estado: 'NORMAL' | 'ALTERADO' | string;
    duracionNormalMin: number;
    duracionActualEstimadaMin: number;
    hayAlternativaMejor: boolean;
    resumenAlerta: string | null;
}