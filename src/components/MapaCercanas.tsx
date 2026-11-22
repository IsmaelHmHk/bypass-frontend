import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Navigation, X, RotateCcw } from 'lucide-react';
import { apiFetch } from '../api/apiClient';
import {
    calcularCercanasAgrupadas,
    guardarCatalogoCache,
    leerCatalogoCache,
    normalizarColorGtfs,
    normalizarTextoColorGtfs,
    obtenerCatalogoDesdeApi,
    type EstacionCatalogo,
    type EstacionCercanaAgrupada,
    type LineaGtfsColor,
    type SalidaParada,
} from '../data/estacionesMadrid';

interface Props {
    onSeleccionarDestino?: (idEstacion: string) => void;
    visible?: boolean;
}

type EstadoUbicacion = 'PENDIENTE_PERMISO' | 'CONCEDIDO' | 'RECHAZADO';

const MADRID_CENTRO: { lat: number; lon: number } = {
    lat: 40.4168,
    lon: -3.7038,
};

function marcadorEstacion(esMasCercana: boolean, colorPrincipal: string) {
    const size = esMasCercana ? 16 : 9;
    const border = esMasCercana ? '2.5px solid #242424' : '1.5px solid #FAF8F4';
    const outline = esMasCercana ? '2px solid #FAF8F4' : 'none';
    const bg = esMasCercana ? colorPrincipal : '#77736D';

    return L.divIcon({
        className: '',
        html: `<div style="
            width:${size}px;
            height:${size}px;
            background:${bg};
            border:${border};
            outline:${outline};
            border-radius:50%;
            opacity:${esMasCercana ? '1' : '0.72'};
        "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

function marcadorUbicacion() {
    return L.divIcon({
        className: '',
        html: `<div style="
            width:14px;
            height:14px;
            background:#242424;
            border:2.5px solid #F4F0E8;
            border-radius:50%;
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });
}

export function MapaCercanas({ onSeleccionarDestino, visible = true }: Props) {
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const markersGroupRef = useRef<L.LayerGroup | null>(null);

    const [catalogo, setCatalogo] = useState<EstacionCatalogo[]>(() => leerCatalogoCache());
    const [coloresLineas, setColoresLineas] = useState<Record<string, { bg: string; fg: string }>>({});

    const [estadoUbicacion, setEstadoUbicacion] = useState<EstadoUbicacion>('PENDIENTE_PERMISO');
    const [ubicacion, setUbicacion] = useState<{ lat: number; lon: number } | null>(null);
    const [buscandoGps, setBuscandoGps] = useState<boolean>(false);

    const [cargandoCatalogo, setCargandoCatalogo] = useState<boolean>(() => leerCatalogoCache().length === 0);
    const [errorCatalogo, setErrorCatalogo] = useState<boolean>(false);

    const [consulta, setConsulta] = useState('');
    const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
    const [destinoElegidoId, setDestinoElegidoId] = useState<string | null>(null);

    const [salidasParada, setSalidasParada] = useState<SalidaParada[]>([]);
    const [cargandoSalidas, setCargandoSalidas] = useState<boolean>(false);
    const [errorSalidas, setErrorSalidas] = useState<boolean>(false);

    const cargarCatalogoYLineas = async (mostrarCargaSiVacio = true) => {
        setErrorCatalogo(false);
        if (mostrarCargaSiVacio && catalogo.length === 0) {
            setCargandoCatalogo(true);
        }

        try {
            const datosApi = await obtenerCatalogoDesdeApi();
            if (datosApi.length > 0) {
                setCatalogo(datosApi);
                guardarCatalogoCache(datosApi);
            }
            setErrorCatalogo(false);
        } catch {
            if (catalogo.length === 0) {
                setErrorCatalogo(true);
            }
        } finally {
            setCargandoCatalogo(false);
        }

        apiFetch<LineaGtfsColor[]>('/catalogo/lineas')
            .then((lineasApi) => {
                if (!Array.isArray(lineasApi)) return;
                const mapa: Record<string, { bg: string; fg: string }> = {};
                for (const l of lineasApi) {
                    const codigo = (l.codigoCorto || '').trim().toUpperCase();
                    if (!codigo) continue;
                    const bg = normalizarColorGtfs(l.colorHex);
                    const fg = normalizarTextoColorGtfs(l.colorTextoHex, bg);
                    mapa[codigo] = { bg, fg };
                }
                setColoresLineas(mapa);
            })
            .catch(() => {});
    };

    const solicitarGps = () => {
        if (!navigator.geolocation) {
            setUbicacion(null);
            setEstadoUbicacion('RECHAZADO');
            return;
        }

        setBuscandoGps(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUbicacion({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                setEstadoUbicacion('CONCEDIDO');
                setBuscandoGps(false);
            },
            () => {
                setUbicacion(null);
                setEstadoUbicacion('RECHAZADO');
                setBuscandoGps(false);
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    useEffect(() => {
        // Si ya había caché local, se muestra de inmediato y se refresca en segundo plano
        cargarCatalogoYLineas(leerCatalogoCache().length === 0);

        if (navigator.permissions?.query) {
            navigator.permissions
                .query({ name: 'geolocation' })
                .then((perm) => {
                    if (perm.state === 'granted') {
                        solicitarGps();
                    } else if (perm.state === 'denied') {
                        setEstadoUbicacion('RECHAZADO');
                    } else {
                        setEstadoUbicacion('PENDIENTE_PERMISO');
                    }
                })
                .catch(() => {
                    setEstadoUbicacion('PENDIENTE_PERMISO');
                });
        }
    }, []);

    const estiloChipLinea = (codigoLinea: string) => {
        const key = codigoLinea.trim().toUpperCase();
        const entrada = coloresLineas[key];
        if (!entrada) {
            return { backgroundColor: '#6E6A63', color: '#FFFFFF' };
        }
        return { backgroundColor: entrada.bg, color: entrada.fg };
    };

    const cercanasAgrupadas: EstacionCercanaAgrupada[] = useMemo(() => {
        if (estadoUbicacion !== 'CONCEDIDO' || !ubicacion) return [];
        return calcularCercanasAgrupadas(catalogo, ubicacion.lat, ubicacion.lon, 3);
    }, [catalogo, ubicacion, estadoUbicacion]);

    const paradaMasCercana: EstacionCercanaAgrupada | null = cercanasAgrupadas[0] || null;

    const consultarSalidasDeParada = (idsEstacion: string[]) => {
        const idPrincipal = idsEstacion[0];
        if (!idPrincipal) return;

        setCargandoSalidas(true);
        setErrorSalidas(false);

        apiFetch<{ proximasSalidas?: SalidaParada[] }>(
            `/catalogo/estaciones/${encodeURIComponent(idPrincipal)}/detalle`
        )
            .then((detalle) => {
                const salidas = Array.isArray(detalle?.proximasSalidas) ? detalle.proximasSalidas : [];
                setSalidasParada(salidas);
            })
            .catch(() => {
                setSalidasParada([]);
                setErrorSalidas(true);
            })
            .finally(() => {
                setCargandoSalidas(false);
            });
    };

    useEffect(() => {
        if (!paradaMasCercana) {
            setSalidasParada([]);
            setErrorSalidas(false);
            return;
        }
        consultarSalidasDeParada(paradaMasCercana.idsEstacion);
    }, [paradaMasCercana?.claveNombre]);

    const mostrarMapa = estadoUbicacion === 'CONCEDIDO' || estadoUbicacion === 'RECHAZADO';

    useEffect(() => {
        if (!mostrarMapa || !mapDivRef.current) return;

        const centro =
            estadoUbicacion === 'CONCEDIDO' && ubicacion ? ubicacion : MADRID_CENTRO;
        const zoom = estadoUbicacion === 'CONCEDIDO' && ubicacion ? 15 : 12;

        if (!mapInstanceRef.current) {
            const map = L.map(mapDivRef.current, {
                center: [centro.lat, centro.lon],
                zoom,
                zoomControl: true,
            });

            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map);

            markersGroupRef.current = L.layerGroup().addTo(map);
            mapInstanceRef.current = map;
        } else {
            mapInstanceRef.current.setView([centro.lat, centro.lon], zoom);
        }

        const map = mapInstanceRef.current;

        const renderizarSoloVisibles = () => {
            const group = markersGroupRef.current;
            if (!group) return;
            group.clearLayers();

            if (estadoUbicacion === 'CONCEDIDO' && ubicacion) {
                L.marker([ubicacion.lat, ubicacion.lon], { icon: marcadorUbicacion() }).addTo(group);
            }

            const bounds = map.getBounds();
            const claveMasCercana = paradaMasCercana?.claveNombre;

            for (const est of catalogo) {
                const lat = Number(est.latitud);
                const lon = Number(est.longitud);
                if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
                if (!bounds.contains([lat, lon])) continue;

                const clave = est.nombre.toLowerCase().replace(/\s+/g, ' ').trim();
                const esCercana = Boolean(claveMasCercana && clave === claveMasCercana);
                const primeraLinea = (est.lineas || [])[0] || '';
                const colorLinea = estiloChipLinea(primeraLinea).backgroundColor;

                L.marker([lat, lon], {
                    icon: marcadorEstacion(esCercana, colorLinea),
                    zIndexOffset: esCercana ? 500 : 0,
                })
                    .bindTooltip(est.nombre, { direction: 'top' })
                    .on('click', () => {
                        setDestinoElegidoId(est.idEstacion);
                        setConsulta(est.nombre);
                    })
                    .addTo(group);
            }
        };

        renderizarSoloVisibles();
        map.on('moveend', renderizarSoloVisibles);
        map.on('zoomend', renderizarSoloVisibles);

        return () => {
            map.off('moveend', renderizarSoloVisibles);
            map.off('zoomend', renderizarSoloVisibles);
        };
    }, [mostrarMapa, estadoUbicacion, ubicacion, catalogo, paradaMasCercana?.claveNombre, coloresLineas]);

    useEffect(() => {
        if (visible && mapInstanceRef.current) {
            setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100);
        }
    }, [visible, mostrarMapa]);

    const sugerencias = useMemo(() => {
        const q = consulta.trim().toLowerCase();
        if (!q) return [];
        const vistos = new Set<string>();
        const filtradas: EstacionCatalogo[] = [];

        for (const e of catalogo) {
            const clave = e.nombre.toLowerCase().replace(/\s+/g, ' ').trim();
            if (vistos.has(clave)) continue;
            const coincideNombre = e.nombre.toLowerCase().includes(q);
            const coincideLinea = (e.lineas || []).some((l) => l.toLowerCase().includes(q));
            if (coincideNombre || coincideLinea) {
                vistos.add(clave);
                filtradas.push(e);
            }
            if (filtradas.length >= 7) break;
        }
        return filtradas;
    }, [consulta, catalogo]);

    const elegirEstacion = (est: EstacionCatalogo) => {
        setConsulta(est.nombre);
        setMostrarSugerencias(false);
        setDestinoElegidoId(est.idEstacion);
        if (onSeleccionarDestino) {
            onSeleccionarDestino(est.idEstacion);
        }
    };

    if (estadoUbicacion === 'PENDIENTE_PERMISO') {
        return (
            <div className="parada-cercana-seccion">
                <article className="parada-tarjeta" aria-label="Permiso de ubicación">
                    <h2 className="parada-nombre">Activa tu ubicación</h2>
                    <p className="parada-sub" style={{ margin: '0.45rem 0 0.75rem' }}>
                        ByPass la usa para mostrarte tu parada más cercana. No la guardamos en ningún servidor
                    </p>
                    <button
                        type="button"
                        className="btn-ir-parada"
                        onClick={solicitarGps}
                        disabled={buscandoGps}
                    >
                        {buscandoGps ? 'Buscando paradas cercanas…' : 'Activar ubicación'}
                    </button>
                </article>
            </div>
        );
    }

    return (
        <div>
            <div className="buscador-bloque">
                <div className="buscador-fila">
                    <Search size={16} aria-hidden="true" />
                    <label htmlFor="input-a-donde-vamos" className="sr-only">
                        ¿A dónde vamos?
                    </label>
                    <input
                        id="input-a-donde-vamos"
                        type="text"
                        className="buscador-input"
                        placeholder="¿A dónde vamos?"
                        value={consulta}
                        onFocus={() => setMostrarSugerencias(true)}
                        onChange={(e) => {
                            setConsulta(e.target.value);
                            setMostrarSugerencias(true);
                        }}
                    />
                    {consulta && (
                        <button
                            type="button"
                            className="btn-icono-limpiar"
                            aria-label="Limpiar búsqueda"
                            onClick={() => {
                                setConsulta('');
                                setMostrarSugerencias(false);
                                setDestinoElegidoId(null);
                            }}
                        >
                            <X size={15} />
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn-gps"
                        onClick={solicitarGps}
                        disabled={buscandoGps}
                    >
                        <Navigation size={13} />
                        <span>{buscandoGps ? '...' : 'GPS'}</span>
                    </button>
                </div>

                {mostrarSugerencias && consulta.trim().length > 0 && (
                    <ul className="sugerencias-dropdown" role="listbox">
                        {sugerencias.length === 0 ? (
                            <li className="sugerencia-btn">
                                <span>Sin coincidencias.</span>
                            </li>
                        ) : (
                            sugerencias.map((est) => (
                                <li key={est.idEstacion}>
                                    <button
                                        type="button"
                                        className="sugerencia-btn"
                                        onClick={() => elegirEstacion(est)}
                                    >
                                        <span>{est.nombre}</span>
                                        <span className="lineas-lista" style={{ margin: 0 }}>
                                            {(est.lineas || []).map((l) => (
                                                <span
                                                    key={l}
                                                    className="linea-chip-oficial"
                                                    style={estiloChipLinea(l)}
                                                >
                                                    {l}
                                                </span>
                                            ))}
                                        </span>
                                    </button>
                                </li>
                            ))
                        )}
                    </ul>
                )}
            </div>

            <div className="mapa-marco">
                <div ref={mapDivRef} className="leaflet-recuadro" />
                {estadoUbicacion === 'RECHAZADO' && (
                    <div className="estado-gps-linea">
                        <span>Sin ubicación. Busca una estación en el buscador</span>
                    </div>
                )}
            </div>

            <div className="parada-cercana-seccion">
                {cargandoCatalogo && catalogo.length === 0 ? (
                    <p className="texto-cargando" role="status">
                        Buscando paradas cercanas…
                    </p>
                ) : errorCatalogo && catalogo.length === 0 ? (
                    <article className="parada-tarjeta">
                        <p className="texto-cargando" style={{ marginTop: 0 }}>
                            No pudimos cargar los datos. Reintentar
                        </p>
                        <button
                            type="button"
                            className="btn-ir-parada"
                            onClick={() => cargarCatalogoYLineas(true)}
                        >
                            <RotateCcw size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />
                            Reintentar
                        </button>
                    </article>
                ) : estadoUbicacion === 'RECHAZADO' ? (
                    <article className="parada-tarjeta">
                        <p className="texto-cargando" style={{ margin: 0 }}>
                            Sin ubicación. Busca una estación en el buscador
                        </p>
                    </article>
                ) : buscandoGps && !paradaMasCercana ? (
                    <p className="texto-cargando" role="status">
                        Buscando paradas cercanas…
                    </p>
                ) : paradaMasCercana ? (
                    <article className="parada-tarjeta" aria-label="Parada más cercana">
                        <div className="parada-cabecera">
                            <div>
                                <h2 className="parada-nombre">{paradaMasCercana.nombre}</h2>
                                <div className="parada-sub">
                                    {paradaMasCercana.esMetroIdentificado
                                        ? 'Metro'
                                        : paradaMasCercana.modoNoDistinguible
                                            ? 'Tipo de transporte no distinguible en los datos'
                                            : 'Estación'}
                                    {paradaMasCercana.tieneEnlaceBus ? ' · Enlace bus' : ''}
                                </div>
                            </div>
                            <span className="parada-distancia">
                                {paradaMasCercana.distanciaMetros} m · ~{paradaMasCercana.minutosAndando} min andando
                            </span>
                        </div>

                        <div className="lineas-lista">
                            {paradaMasCercana.lineas.map((linea) => (
                                <span
                                    key={linea}
                                    className="linea-chip-oficial"
                                    style={estiloChipLinea(linea)}
                                >
                                    {linea}
                                </span>
                            ))}
                        </div>

                        <div className="salidas-bloque">
                            {cargandoSalidas ? (
                                <span className="texto-cargando">Buscando paradas cercanas…</span>
                            ) : errorSalidas ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                    <span className="texto-cargando">No pudimos cargar los datos. Reintentar</span>
                                    <button
                                        type="button"
                                        className="btn-secundario-tarjeta"
                                        onClick={() => consultarSalidasDeParada(paradaMasCercana.idsEstacion)}
                                    >
                                        Reintentar
                                    </button>
                                </div>
                            ) : salidasParada.length > 0 ? (
                                salidasParada.slice(0, 3).map((s, idx) => (
                                    <div key={`${s.linea}-${idx}`} className="salida-item">
                                        <span className="salida-izquierda">
                                            <span
                                                className="linea-chip-oficial"
                                                style={estiloChipLinea(s.linea)}
                                            >
                                                {s.linea}
                                            </span>
                                            <span>
                                                → {s.destino}: <strong>{s.minutos} min</strong>
                                                {s.horaSalida ? ` (${s.horaSalida})` : ''}
                                            </span>
                                        </span>
                                        <span
                                            className={`etiqueta-fuente ${
                                                s.fuente === 'EN_VIVO' ? 'etiqueta-fuente--directo' : ''
                                            }`}
                                        >
                                            {s.fuente === 'EN_VIVO' ? 'En directo' : 'Teórico'}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <span className="parada-sub">Sin horarios disponibles para esta parada</span>
                            )}
                        </div>

                        <div style={{ marginBottom: '0.55rem' }}>
                            <span className="sin-incidencias">Sin incidencias comunicadas</span>
                        </div>

                        {onSeleccionarDestino && (
                            <button
                                type="button"
                                className="btn-ir-parada"
                                onClick={() =>
                                    onSeleccionarDestino(destinoElegidoId || paradaMasCercana.idEstacionPrincipal)
                                }
                            >
                                Ir hasta esta parada
                            </button>
                        )}
                    </article>
                ) : (
                    <p className="texto-cargando">Sin horarios disponibles para esta parada</p>
                )}
            </div>
        </div>
    );
}