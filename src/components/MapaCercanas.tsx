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
    type SalidaParada,
} from '../data/estacionesMadrid';

interface LineaCatalogoApi {
    codigoCorto: string;
    colorHex?: string | null;
    colorTextoHex?: string | null;
}

interface Props {
    onSeleccionarDestino?: (idEstacion: string) => void;
    visible?: boolean;
}

const COLOR_SIN_DATO = '#6E6A63';

function normalizarHex(hex?: string | null): string {
    if (!hex) return COLOR_SIN_DATO;
    const limpio = hex.trim().replace(/^#/, '');
    if (/^[0-9A-Fa-f]{6}$/.test(limpio) || /^[0-9A-Fa-f]{3}$/.test(limpio)) {
        return `#${limpio.toUpperCase()}`;
    }
    return COLOR_SIN_DATO;
}

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
    const [ubicacion, setUbicacion] = useState<{ lat: number; lon: number } | null>(null);
    const [buscandoGps, setBuscandoGps] = useState<boolean>(false);

    const [consulta, setConsulta] = useState('');
    const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
    const [destinoElegidoId, setDestinoElegidoId] = useState<string | null>(null);

    const [salidasParada, setSalidasParada] = useState<SalidaParada[]>([]);
    const [cargandoSalidas, setCargandoSalidas] = useState<boolean>(false);

    const solicitarGps = () => {
        setBuscandoGps(true);
        if (!navigator.geolocation) {
            setBuscandoGps(false);
            setUbicacion(null);
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

        apiFetch<LineaCatalogoApi[]>('/catalogo/lineas')
            .then((lineasApi) => {
                if (!Array.isArray(lineasApi)) return;
                const mapa: Record<string, { bg: string; fg: string }> = {};
                for (const l of lineasApi) {
                    const codigo = (l.codigoCorto || '').trim().toUpperCase();
                    if (!codigo) continue;
                    const bg = normalizarHex(l.colorHex);
                    const fg = normalizarHex(l.colorTextoHex) !== COLOR_SIN_DATO
                        ? normalizarHex(l.colorTextoHex)
                        : '#FFFFFF';
                    mapa[codigo] = { bg, fg };
                }
                setColoresLineas(mapa);
            })
            .catch(() => {});
    }, []);

    const estiloChipLinea = (codigoLinea: string) => {
        const key = codigoLinea.trim().toUpperCase();
        const entrada = coloresLineas[key];
        if (!entrada) {
            return { backgroundColor: COLOR_SIN_DATO, color: '#FFFFFF' };
        }
        return { backgroundColor: entrada.bg, color: entrada.fg };
    };

    const cercanas: EstacionCercanaLocal[] = useMemo(() => {
        if (!ubicacion) return [];
        return calcularCercanasEnCliente(catalogo, ubicacion.lat, ubicacion.lon, 3);
    }, [catalogo, ubicacion]);

    const paradaMasCercana: EstacionCercanaLocal | null = cercanas[0] || null;

    // Consultar salidas reales solo para la parada más cercana
    useEffect(() => {
        if (!paradaMasCercana?.idEstacion) {
            setSalidasParada([]);
            return;
        }

        let cancelado = false;
        setCargandoSalidas(true);

        apiFetch<{ proximasSalidas?: SalidaParada[] }>(
            `/catalogo/estaciones/${encodeURIComponent(paradaMasCercana.idEstacion)}/detalle`
        )
            .then((detalle) => {
                if (cancelado) return;
                const salidas = Array.isArray(detalle?.proximasSalidas) ? detalle.proximasSalidas : [];
                setSalidasParada(salidas);
            })
            .catch(() => {
                if (cancelado) return;
                setSalidasParada([]);
            })
            .finally(() => {
                if (!cancelado) setCargandoSalidas(false);
            });

        return () => {
            cancelado = true;
        };
    }, [paradaMasCercana?.idEstacion]);

    // Inicializar y actualizar mapa centrado en la ubicación del usuario con zoom 15
    useEffect(() => {
        if (!mapDivRef.current || !ubicacion) return;

        if (!mapInstanceRef.current) {
            const map = L.map(mapDivRef.current, {
                center: [ubicacion.lat, ubicacion.lon],
                zoom: 15,
                zoomControl: true,
            });

            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map);

            markersGroupRef.current = L.layerGroup().addTo(map);
            mapInstanceRef.current = map;
        } else {
            mapInstanceRef.current.setView([ubicacion.lat, ubicacion.lon], 15);
        }

        const map = mapInstanceRef.current;

        const renderizarSoloVisibles = () => {
            const group = markersGroupRef.current;
            if (!group) return;
            group.clearLayers();

            L.marker([ubicacion.lat, ubicacion.lon], { icon: marcadorUbicacion() }).addTo(group);

            const bounds = map.getBounds();
            const idMasCercana = paradaMasCercana?.idEstacion;

            catalogo.forEach((est) => {
                const lat = Number(est.latitud);
                const lon = Number(est.longitud);
                if (Number.isNaN(lat) || Number.isNaN(lon)) return;
                if (!bounds.contains([lat, lon])) return;

                const esCercana = est.idEstacion === idMasCercana;
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
            });
        };

        renderizarSoloVisibles();
        map.on('moveend', renderizarSoloVisibles);
        map.on('zoomend', renderizarSoloVisibles);

        return () => {
            map.off('moveend', renderizarSoloVisibles);
            map.off('zoomend', renderizarSoloVisibles);
        };
    }, [ubicacion, catalogo, paradaMasCercana?.idEstacion, coloresLineas]);

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

    const elegirEstacion = (est: EstacionCatalogo) => {
        setConsulta(est.nombre);
        setMostrarSugerencias(false);
        setDestinoElegidoId(est.idEstacion);
        if (onSeleccionarDestino) {
            onSeleccionarDestino(est.idEstacion);
        }
    };

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
                {ubicacion ? (
                    <div ref={mapDivRef} className="leaflet-recuadro" />
                ) : (
                    <div className="leaflet-recuadro" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                        <span className="texto-cargando">Activa la ubicación para ver tu parada más cercana</span>
                    </div>
                )}
            </div>

            <div className="parada-cercana-seccion">
                {!ubicacion ? (
                    <article className="parada-tarjeta">
                        <p className="texto-cargando">Activa la ubicación para ver tu parada más cercana</p>
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
                                    {paradaMasCercana.codigoParada ? `Parada ${paradaMasCercana.codigoParada}` : 'Estación'}
                                </div>
                            </div>
                            <span className="parada-distancia">
                                {paradaMasCercana.distanciaMetros} m · ~{paradaMasCercana.minutosAndando} min andando
                            </span>
                        </div>

                        <div className="lineas-lista">
                            {(paradaMasCercana.lineas || []).map((linea) => (
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
                                onClick={() => onSeleccionarDestino(destinoElegidoId || paradaMasCercana.idEstacion)}
                            >
                                Ir hasta esta parada
                            </button>
                        )}
                    </article>
                ) : (
                    <p className="texto-cargando">Sin horarios disponibles</p>
                )}
            </div>
        </div>
    );
}