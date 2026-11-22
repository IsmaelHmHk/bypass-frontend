import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Navigation, X } from 'lucide-react';
import { apiFetch } from '../api/apiClient';
import {
    calcularCercanasEnCliente,
    guardarCatalogoCache,
    leerCatalogoCache,
    type EstacionCatalogo,
    type EstacionCercanaLocal,
    type OpcionRutaApi,
    type RespuestaRutaApi,
    type SalidaParada,
} from '../data/estacionesMadrid';

interface Props {
    onSeleccionarDestino?: (idEstacion: string) => void;
    visible?: boolean;
}

export function colorLineaOficial(linea: string): string {
    const code = linea.trim().toUpperCase().replace(/\s+/g, '');
    switch (code) {
        case 'C1':
        case 'C-1':
            return '#75B7E5';
        case 'C2':
        case 'C-2':
            return '#009A44';
        case 'C3':
        case 'C-3':
            return '#812990';
        case 'C4':
        case 'C-4':
        case 'C4A':
        case 'C-4A':
        case 'C4B':
        case 'C-4B':
            return '#002D72';
        case 'C5':
        case 'C-5':
            return '#F7B500';
        case 'C7':
        case 'C-7':
            return '#E30613';
        case 'C8':
        case 'C-8':
            return '#5C6670';
        case 'C10':
        case 'C-10':
            return '#84BD00';
        case 'L1':
            return '#2DBEF0';
        case 'L2':
            return '#ED1C24';
        case 'L3':
            return '#FFD200';
        case 'L4':
            return '#A65E2E';
        case 'L5':
            return '#6CC24A';
        case 'L6':
            return '#7C878E';
        case 'L7':
            return '#FF7900';
        case 'L8':
            return '#EC68A4';
        case 'L9':
            return '#A51890';
        case 'L10':
            return '#0055A4';
        case 'L11':
            return '#00843D';
        case 'L12':
            return '#A49900';
        default:
            return '#242424';
    }
}

function esCercanias(estacion: EstacionCatalogo): boolean {
    if (estacion.idEstacion.startsWith('madrid_renfe_')) return true;
    return (estacion.lineas || []).some((l) => /^C-?\d+/i.test(l.trim()));
}

function marcadorEstacion(estacion: EstacionCatalogo, seleccionada: boolean) {
    const cercanias = esCercanias(estacion);
    const color = cercanias ? '#812990' : '#242424';
    const size = seleccionada ? 14 : 11;
    const radius = cercanias ? '2px' : '50%';

    return L.divIcon({
        className: '',
        html: `<div style="
            width:${size}px;
            height:${size}px;
            background:${color};
            border:2px solid #FAF8F4;
            border-radius:${radius};
            outline:${seleccionada ? '2px solid #242424' : 'none'};
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

function formatearFuente(fuenteDato?: string): 'EN_VIVO' | 'TEORICO' {
    if (!fuenteDato) return 'TEORICO';
    const upper = fuenteDato.toUpperCase();
    return upper.includes('VIVO') || upper.includes('RT') || upper.includes('DIRECTO')
        ? 'EN_VIVO'
        : 'TEORICO';
}

export function MapaCercanas({ onSeleccionarDestino, visible = true }: Props) {
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const markersGroupRef = useRef<L.LayerGroup | null>(null);
    const mapInitializedRef = useRef<boolean>(false);

    const [catalogo, setCatalogo] = useState<EstacionCatalogo[]>(() => leerCatalogoCache());
    const [ubicacion, setUbicacion] = useState<{ lat: number; lon: number } | null>(null);
    const [buscandoGps, setBuscandoGps] = useState<boolean>(false);
    const [sinGpsMensaje, setSinGpsMensaje] = useState<string>(
        'Activa la ubicación para ver tu parada más cercana'
    );

    const [consulta, setConsulta] = useState('');
    const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

    const [salidasParada, setSalidasParada] = useState<SalidaParada[]>([]);
    const [cargandoSalidas, setCargandoSalidas] = useState<boolean>(false);

    const [destinoBuscado, setDestinoBuscado] = useState<EstacionCatalogo | null>(null);
    const [rutaHaciaDestino, setRutaHaciaDestino] = useState<RespuestaRutaApi | null>(null);
    const [cargandoRuta, setCargandoRuta] = useState<boolean>(false);
    const [errorRuta, setErrorRuta] = useState<string | null>(null);

    const solicitarGps = () => {
        setBuscandoGps(true);
        if (!navigator.geolocation) {
            setBuscandoGps(false);
            setUbicacion(null);
            setSinGpsMensaje('Activa la ubicación para ver tu parada más cercana');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUbicacion({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                setBuscandoGps(false);
            },
            () => {
                setUbicacion(null);
                setBuscandoGps(false);
                setSinGpsMensaje('Activa la ubicación para ver tu parada más cercana');
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    useEffect(() => {
        solicitarGps();

        apiFetch<EstacionCatalogo[]>('/catalogo/estaciones')
            .then((datos) => {
                if (Array.isArray(datos)) {
                    const normalizadas = datos.map((d) => ({
                        ...d,
                        lineas: Array.isArray(d.lineas) ? d.lineas : [],
                    }));
                    setCatalogo(normalizadas);
                    guardarCatalogoCache(normalizadas);
                }
            })
            .catch(() => {});
    }, []);

    // Parada más cercana calculada únicamente con ubicación GPS real
    const cercanas: EstacionCercanaLocal[] = useMemo(() => {
        if (!ubicacion) return [];
        return calcularCercanasEnCliente(catalogo, ubicacion.lat, ubicacion.lon, 3);
    }, [catalogo, ubicacion]);

    const paradaSalida: EstacionCercanaLocal | null = cercanas[0] || null;

    // Consultar backend solo para horarios y retrasos de la parada de salida más cercana
    useEffect(() => {
        if (!paradaSalida?.idEstacion) {
            setSalidasParada([]);
            return;
        }

        let cancelado = false;
        setCargandoSalidas(true);

        apiFetch<{ proximasSalidas?: SalidaParada[] }>(
            `/catalogo/estaciones/${encodeURIComponent(paradaSalida.idEstacion)}/detalle`
        )
            .then((detalle) => {
                if (cancelado) return;
                const salidas = Array.isArray(detalle?.proximasSalidas) ? detalle.proximasSalidas : [];
                setSalidasParada(salidas);
            })
            .catch(() => {
                if (cancelado) return;
                setSalidasParada(
                    Array.isArray(paradaSalida.proximasSalidas) ? paradaSalida.proximasSalidas : []
                );
            })
            .finally(() => {
                if (!cancelado) setCargandoSalidas(false);
            });

        return () => {
            cancelado = true;
        };
    }, [paradaSalida?.idEstacion]);

    // Calcular ruta desde parada de salida más cercana hasta el destino elegido
    const calcularRutaADestino = async (origenId: string, destinoId: string) => {
        setCargandoRuta(true);
        setErrorRuta(null);
        setRutaHaciaDestino(null);

        try {
            const data = await apiFetch<RespuestaRutaApi>(
                `/rutas/buscar?origen=${encodeURIComponent(origenId)}&destino=${encodeURIComponent(destinoId)}`
            );
            setRutaHaciaDestino(data);
            if (!data?.rutaRecomendada) {
                setErrorRuta('No hay ruta disponible con los datos actuales.');
            }
        } catch (err) {
            setErrorRuta(err instanceof Error ? err.message : 'No se pudo consultar la ruta');
        } finally {
            setCargandoRuta(false);
        }
    };

    useEffect(() => {
        if (destinoBuscado && paradaSalida?.idEstacion) {
            calcularRutaADestino(paradaSalida.idEstacion, destinoBuscado.idEstacion);
        } else {
            setRutaHaciaDestino(null);
            setErrorRuta(null);
        }
    }, [destinoBuscado, paradaSalida?.idEstacion]);

    // Inicializar mapa Leaflet con OpenStreetMap + filtro CSS gris, pintando solo paradas visibles
    useEffect(() => {
        if (!mapDivRef.current) return;

        if (!mapInstanceRef.current) {
            const map = L.map(mapDivRef.current, {
                zoomControl: true,
            });

            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map);

            markersGroupRef.current = L.layerGroup().addTo(map);
            mapInstanceRef.current = map;
        }

        const map = mapInstanceRef.current;

        if (ubicacion && (!mapInitializedRef.current || buscandoGps === false)) {
            map.setView([ubicacion.lat, ubicacion.lon], 15);
            mapInitializedRef.current = true;
        } else if (!mapInitializedRef.current && catalogo.length > 0) {
            const primera = catalogo[0];
            if (!Number.isNaN(Number(primera.latitud)) && !Number.isNaN(Number(primera.longitud))) {
                map.setView([Number(primera.latitud), Number(primera.longitud)], 13);
                mapInitializedRef.current = true;
            }
        }

        const actualizarMarcadoresVisibles = () => {
            const group = markersGroupRef.current;
            if (!group) return;
            group.clearLayers();

            if (ubicacion) {
                L.marker([ubicacion.lat, ubicacion.lon], { icon: marcadorUbicacion() }).addTo(group);
            }

            if (!map.getCenter()) return;
            const bounds = map.getBounds();

            catalogo.forEach((est) => {
                const lat = Number(est.latitud);
                const lon = Number(est.longitud);
                if (Number.isNaN(lat) || Number.isNaN(lon)) return;
                if (!bounds.contains([lat, lon])) return;

                const marcada =
                    paradaSalida?.idEstacion === est.idEstacion ||
                    destinoBuscado?.idEstacion === est.idEstacion;

                L.marker([lat, lon], {
                    icon: marcadorEstacion(est, marcada),
                })
                    .bindTooltip(est.nombre, { direction: 'top' })
                    .on('click', () => {
                        setDestinoBuscado(est);
                        setConsulta(est.nombre);
                    })
                    .addTo(group);
            });
        };

        actualizarMarcadoresVisibles();
        map.on('moveend', actualizarMarcadoresVisibles);
        map.on('zoomend', actualizarMarcadoresVisibles);

        return () => {
            map.off('moveend', actualizarMarcadoresVisibles);
            map.off('zoomend', actualizarMarcadoresVisibles);
        };
    }, [ubicacion, buscandoGps, catalogo, paradaSalida?.idEstacion, destinoBuscado?.idEstacion]);

    useEffect(() => {
        if (visible && mapInstanceRef.current) {
            setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100);
        }
    }, [visible]);

    const sugerencias = useMemo(() => {
        const q = consulta.trim().toLowerCase();
        if (!q) return [];
        return catalogo
            .filter(
                (e) =>
                    e.nombre.toLowerCase().includes(q) ||
                    (e.codigoParada || '').toLowerCase().includes(q) ||
                    (e.lineas || []).some((l) => l.toLowerCase().includes(q))
            )
            .slice(0, 7);
    }, [consulta, catalogo]);

    const elegirDestino = (est: EstacionCatalogo) => {
        setConsulta(est.nombre);
        setMostrarSugerencias(false);
        setDestinoBuscado(est);
    };

    const limpiarBusqueda = () => {
        setConsulta('');
        setMostrarSugerencias(false);
        setDestinoBuscado(null);
        setRutaHaciaDestino(null);
        setErrorRuta(null);
    };

    const renderOpcionRuta = (op: OpcionRutaApi, tituloEtiqueta: string) => {
        const tramosTransporte = (op.tramos || []).filter((t) => t.tipo !== 'TRANSBORDO_PIE');
        const esDirecto = formatearFuente(tramosTransporte[0]?.fuenteDato) === 'EN_VIVO';
        const tieneIncidencia = (op.tramos || []).some(
            (t) => t.estado && t.estado !== 'NORMAL' && t.estado !== 'EN_HORA'
        );

        return (
            <div key={op.idRuta} className="ruta-calculada-box">
                <div className="ruta-cabecera-linea">
                    <strong>
                        {tituloEtiqueta} · {op.duracionTotalMin} min
                    </strong>
                    <span>
                        {op.horaSalidaEstimada ? `Sale ${op.horaSalidaEstimada} · ` : ''}
                        Llega ~{op.horaLlegadaEstimada}
                    </span>
                </div>

                <div className="lineas-lista">
                    <span className="parada-sub">
                        {op.numTransbordos === 0
                            ? 'Sin transbordos'
                            : `${op.numTransbordos} ${op.numTransbordos === 1 ? 'transbordo' : 'transbordos'}`}
                    </span>
                    <span className={`etiqueta-fuente ${esDirecto ? 'etiqueta-fuente--directo' : ''}`}>
                        {esDirecto ? 'En directo' : 'Teórico'}
                    </span>
                </div>

                {(op.tramos || []).map((tramo) => (
                    <div key={tramo.orden} className="tramo-fila">
                        <div className="salida-izquierda">
                            {tramo.tipo === 'TRANSBORDO_PIE' ? (
                                <span>
                                    <strong>A pie</strong>: {tramo.origen} → {tramo.destino} ({tramo.duracionMin} min)
                                </span>
                            ) : (
                                <>
                                    <span
                                        className="linea-chip-oficial"
                                        style={{ backgroundColor: colorLineaOficial(tramo.linea) }}
                                    >
                                        {tramo.linea}
                                    </span>
                                    <span>
                                        {tramo.origen} → {tramo.destino} ({tramo.duracionMin} min
                                        {tramo.esperaMin > 0 ? `, espera ${tramo.esperaMin} min` : ''})
                                    </span>
                                </>
                            )}
                        </div>
                        {tramo.estado && tramo.estado !== 'NORMAL' && tramo.estado !== 'EN_HORA' && (
                            <span className="aviso-incidencia">{tramo.estado}</span>
                        )}
                    </div>
                ))}

                {op.explicacion && <span className="parada-sub">{op.explicacion}</span>}

                {tieneIncidencia ? (
                    <span className="aviso-incidencia">Incidencia detectada en el trayecto</span>
                ) : (
                    <span className="sin-incidencias">Sin incidencias comunicadas</span>
                )}
            </div>
        );
    };

    const alternativaMasRapida: OpcionRutaApi | null = useMemo(() => {
        if (!rutaHaciaDestino?.rutaRecomendada || !Array.isArray(rutaHaciaDestino.alternativas)) {
            return null;
        }
        const principalDur = rutaHaciaDestino.rutaRecomendada.duracionTotalMin;
        const masRapidas = rutaHaciaDestino.alternativas.filter(
            (alt) => alt.duracionTotalMin < principalDur
        );
        return masRapidas[0] || null;
    }, [rutaHaciaDestino]);

    return (
        <div>
            {/* Buscador "¿A dónde vamos?" con botón GPS */}
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
                            onClick={limpiarBusqueda}
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
                                        onClick={() => elegirDestino(est)}
                                    >
                                        <span>{est.nombre}</span>
                                        <span className="lineas-lista" style={{ margin: 0 }}>
                                            {(est.lineas || []).slice(0, 4).map((l) => (
                                                <span
                                                    key={l}
                                                    className="linea-chip-oficial"
                                                    style={{ backgroundColor: colorLineaOficial(l) }}
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

            {/* Mapa en recuadro de altura fija con OpenStreetMap + filtro gris */}
            <div className="mapa-marco">
                <div ref={mapDivRef} className="leaflet-recuadro" />
                <div className="estado-gps-linea">
                    <span>{ubicacion ? 'Ubicación GPS activa' : sinGpsMensaje}</span>
                    <span>Cercanías · Metro</span>
                </div>
            </div>

            {/* Debajo del mapa: ruta hacia destino buscado O parada más cercana */}
            <div className="parada-cercana-seccion">
                {destinoBuscado ? (
                    <article className="parada-tarjeta" aria-label="Ruta hacia el destino">
                        <div className="parada-cabecera">
                            <div>
                                <div className="parada-sub">Destino</div>
                                <h2 className="parada-nombre">{destinoBuscado.nombre}</h2>
                            </div>
                            <button
                                type="button"
                                className="btn-secundario-tarjeta"
                                onClick={limpiarBusqueda}
                            >
                                Cerrar
                            </button>
                        </div>

                        {!ubicacion || !paradaSalida ? (
                            <p className="texto-cargando">
                                Activa la ubicación para calcular cómo llegar desde tu parada más cercana a{' '}
                                {destinoBuscado.nombre}.
                            </p>
                        ) : cargandoRuta ? (
                            <p className="texto-cargando" role="status">
                                Calculando ruta desde {paradaSalida.nombre}…
                            </p>
                        ) : errorRuta ? (
                            <p className="texto-cargando">{errorRuta}</p>
                        ) : rutaHaciaDestino?.rutaRecomendada ? (
                            <>
                                <div className="parada-sub">
                                    Salida desde <strong>{paradaSalida.nombre}</strong> ({paradaSalida.distanciaMetros} m ·
                                    ~{paradaSalida.minutosAndando} min andando)
                                </div>

                                {rutaHaciaDestino.hayAlertaBypass && rutaHaciaDestino.mensajeBypass && (
                                    <div className="aviso-incidencia">{rutaHaciaDestino.mensajeBypass}</div>
                                )}

                                {renderOpcionRuta(rutaHaciaDestino.rutaRecomendada, 'Ruta recomendada')}

                                {alternativaMasRapida && (
                                    <div className="alternativa-box">
                                        {renderOpcionRuta(alternativaMasRapida, 'Alternativa más rápida')}
                                    </div>
                                )}
                            </>
                        ) : null}
                    </article>
                ) : !ubicacion ? (
                    <article className="parada-tarjeta">
                        <p className="texto-cargando">{sinGpsMensaje}</p>
                    </article>
                ) : buscandoGps && !paradaSalida ? (
                    <p className="texto-cargando" role="status">
                        Buscando paradas cercanas…
                    </p>
                ) : paradaSalida ? (
                    <article className="parada-tarjeta" aria-label="Parada más cercana">
                        <div className="parada-cabecera">
                            <div>
                                <h2 className="parada-nombre">{paradaSalida.nombre}</h2>
                                <div className="parada-sub">
                                    {paradaSalida.codigoParada ? `Parada ${paradaSalida.codigoParada}` : 'Estación'}
                                </div>
                            </div>
                            <span className="parada-distancia">
                                {paradaSalida.distanciaMetros} m · ~{paradaSalida.minutosAndando} min andando
                            </span>
                        </div>

                        <div className="lineas-lista">
                            {(paradaSalida.lineas || []).map((linea) => (
                                <span
                                    key={linea}
                                    className="linea-chip-oficial"
                                    style={{ backgroundColor: colorLineaOficial(linea) }}
                                >
                                    {linea}
                                </span>
                            ))}
                        </div>

                        <div className="salidas-bloque">
                            {cargandoSalidas ? (
                                <span className="texto-cargando">Consultando próximas salidas…</span>
                            ) : salidasParada.length > 0 ? (
                                salidasParada.slice(0, 3).map((s, idx) => (
                                    <div key={`${s.linea}-${idx}`} className="salida-item">
                                        <span className="salida-izquierda">
                                            <span
                                                className="linea-chip-oficial"
                                                style={{ backgroundColor: colorLineaOficial(s.linea) }}
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
                                <span className="parada-sub">Sin horarios disponibles</span>
                            )}
                        </div>

                        <div style={{ marginBottom: '0.55rem' }}>
                            <span className="sin-incidencias">Sin incidencias comunicadas</span>
                        </div>

                        {onSeleccionarDestino && (
                            <button
                                type="button"
                                className="btn-ir-parada"
                                onClick={() => onSeleccionarDestino(paradaSalida.idEstacion)}
                            >
                                Ir hasta esta parada
                            </button>
                        )}
                    </article>
                ) : (
                    <p className="texto-cargando">Activa la ubicación para ver tu parada más cercana</p>
                )}
            </div>
        </div>
    );
}