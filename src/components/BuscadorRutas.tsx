import { useEffect, useState } from 'react';
import {
    Navigation,
    ArrowRight,
    Train,
    Footprints,
    Bookmark,
    FileCheck2,
    Accessibility,
    Trash2,
    AlertTriangle,
    RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../api/apiClient';
import type {
    EstacionParada,
    RutaBusqueda,
    RutaOpcion,
    EstadoRutaHabitual,
    TrayectoFavorito,
} from '../types/bypass';

const STORAGE_FAVORITOS = 'bypass_trayectos_favoritos_v1';

export function BuscadorRutas({
                                  estaciones,
                                  destinoPreseleccionado,
                              }: {
    estaciones: EstacionParada[];
    destinoPreseleccionado?: string;
}) {
    const [origen, setOrigen] = useState('');
    const [destino, setDestino] = useState('');
    const [soloSinEscaleras, setSoloSinEscaleras] = useState(false);
    const [resultado, setResultado] = useState<RutaBusqueda | null>(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const [estadosHabituales, setEstadosHabituales] = useState<Record<string, EstadoRutaHabitual>>({});
    const [favoritos, setFavoritos] = useState<TrayectoFavorito[]>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_FAVORITOS);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        if (destinoPreseleccionado) {
            setDestino(destinoPreseleccionado);
        }
    }, [destinoPreseleccionado]);

    const refrescarEstadoHabituales = async (lista: TrayectoFavorito[]) => {
        if (lista.length === 0) {
            setEstadosHabituales({});
            return;
        }
        try {
            const payload = {
                trayectos: lista.map((f) => ({
                    id: f.id,
                    origen: f.origenId,
                    destino: f.destinoId,
                })),
            };
            const estados = await apiFetch<EstadoRutaHabitual[]>('/rutas/estado-habituales', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const mapa: Record<string, EstadoRutaHabitual> = {};
            for (const est of estados) {
                mapa[est.id] = est;
            }
            setEstadosHabituales(mapa);
        } catch {
            // No bloquear la vista si falla el chequeo de habituales
        }
    };

    useEffect(() => {
        refrescarEstadoHabituales(favoritos);
    }, [favoritos]);

    const ejecutarCalculo = async (idOrig: string, idDest: string, pmr = soloSinEscaleras) => {
        if (!idOrig || !idDest) return;
        setError('');
        setCargando(true);
        setResultado(null);
        try {
            const data = await apiFetch<RutaBusqueda>(
                `/rutas/buscar?origen=${encodeURIComponent(idOrig)}&destino=${encodeURIComponent(idDest)}&soloPmr=${pmr}`
            );
            setResultado(data);
            if (!data.rutaRecomendada) {
                setError('No se encontraron rutas disponibles entre las estaciones seleccionadas.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo calcular la ruta');
        } finally {
            setCargando(false);
        }
    };

    const calcular = (e: React.FormEvent) => {
        e.preventDefault();
        ejecutarCalculo(origen, destino, soloSinEscaleras);
    };

    const guardarFavorito = () => {
        if (!origen || !destino || origen === destino) return;
        const estOrig = estaciones.find((e) => e.idEstacion === origen);
        const estDest = estaciones.find((e) => e.idEstacion === destino);
        if (!estOrig || !estDest) return;

        const nuevo: TrayectoFavorito = {
            id: `${origen}__${destino}`,
            etiqueta: `${estOrig.nombre} → ${estDest.nombre}`,
            origenId: origen,
            origenNombre: estOrig.nombre,
            destinoId: destino,
            destinoNombre: estDest.nombre,
        };

        const actualizados = [nuevo, ...favoritos.filter((f) => f.id !== nuevo.id)].slice(0, 4);
        setFavoritos(actualizados);
        localStorage.setItem(STORAGE_FAVORITOS, JSON.stringify(actualizados));
    };

    const borrarFavorito = (id: string) => {
        const actualizados = favoritos.filter((f) => f.id !== id);
        setFavoritos(actualizados);
        localStorage.setItem(STORAGE_FAVORITOS, JSON.stringify(actualizados));
    };

    const estacionesFiltradas = soloSinEscaleras
        ? estaciones.filter((e) => e.accesiblePmr !== false)
        : estaciones;

    const renderOpcion = (op: RutaOpcion, esPrincipal: boolean) => {
        const tieneIncidencia = op.tramos.some(
            (t) => t.estado === 'INCIDENCIA_GRAVE' || t.estado === 'RETRASOS'
        );

        return (
            <div key={op.idRuta} className={esPrincipal ? 'ruta-principal' : 'alt-box'}>
                <div className="ruta-resumen">
                    <strong>{op.duracionTotalMin} min estimados</strong>
                    <span>Llegada ~{op.horaLlegadaEstimada}</span>
                    <span>
                        {op.numTransbordos === 0
                            ? 'Directo'
                            : `${op.numTransbordos} ${op.numTransbordos === 1 ? 'transbordo' : 'transbordos'}`}
                    </span>
                    <span className={tieneIncidencia ? 'warn' : 'ok'}>
                        {tieneIncidencia ? 'Incidencia / demora' : `Fiabilidad ${op.fiabilidad}`}
                    </span>
                    {!esPrincipal && op.diferenciaMin !== null && op.diferenciaMin !== 0 && (
                        <span>{op.diferenciaMin > 0 ? `+${op.diferenciaMin} min` : `${op.diferenciaMin} min`}</span>
                    )}
                </div>

                <p className="ruta-explicacion">{op.explicacion}</p>

                <ul className="pasos-lista">
                    {op.tramos.map((tramo) => (
                        <li key={tramo.orden}>
                            {tramo.tipo === 'TRANSBORDO_PIE' ? (
                                <>
                                    <Footprints size={15} /> <strong>A pie</strong>: {tramo.origen} → {tramo.destino} ({tramo.duracionMin} min)
                                </>
                            ) : (
                                <>
                                    <Train size={15} /> <strong>{tramo.linea}</strong>: {tramo.origen} → {tramo.destino} (
                                    {tramo.duracionMin} min{tramo.esperaMin > 0 ? `, espera ~${tramo.esperaMin} min` : ''})
                                    {tramo.paradasIntermedias.length > 0 && (
                                        <span className="paradas-intermedias">
                                            {' '}· Intermedias: {tramo.paradasIntermedias.join(', ')}
                                        </span>
                                    )}
                                </>
                            )}
                        </li>
                    ))}
                </ul>

                {esPrincipal && tieneIncidencia && (
                    <a
                        href="https://www.renfe.com/es/es/cercanias/cercanias-madrid/justificantes"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-justificante"
                    >
                        <FileCheck2 size={16} /> Solicitar justificante oficial de retraso
                    </a>
                )}
            </div>
        );
    };

    return (
        <section className="card" aria-label="Planificador de rutas anti-caos">
            <div className="card-header">
                <h2><Navigation size={20} /> Ir a... (Ruta Anti-Caos)</h2>
            </div>

            {favoritos.length > 0 && (
                <div className="favoritos-bar" aria-label="Mis trayectos guardados en un toque">
                    {favoritos.map((fav) => {
                        const estado = estadosHabituales[fav.id];
                        const alterado = estado?.estado === 'ALTERADO';
                        return (
                            <div key={fav.id} className={`fav-chip ${alterado ? 'fav-alerta' : ''}`}>
                                <button
                                    type="button"
                                    className="fav-go"
                                    onClick={() => {
                                        setOrigen(fav.origenId);
                                        setDestino(fav.destinoId);
                                        ejecutarCalculo(fav.origenId, fav.destinoId);
                                    }}
                                >
                                    {alterado ? '⚠️' : '⚡'} {fav.etiqueta}
                                    {estado ? ` (${estado.duracionActualEstimadaMin} min)` : ''}
                                </button>
                                <button
                                    type="button"
                                    className="fav-del"
                                    onClick={() => borrarFavorito(fav.id)}
                                    aria-label={`Eliminar trayecto ${fav.etiqueta}`}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        );
                    })}
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => refrescarEstadoHabituales(favoritos)}
                        title="Comprobar estado actual de trayectos guardados"
                        aria-label="Comprobar estado actual de trayectos guardados"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            )}

            <form onSubmit={calcular} className="ruta-form">
                <label htmlFor="select-origen" className="sr-only">Origen</label>
                <select
                    id="select-origen"
                    className="select"
                    value={origen}
                    onChange={(e) => setOrigen(e.target.value)}
                    required
                >
                    <option value="">¿Desde dónde sales?</option>
                    {estacionesFiltradas.map((e) => (
                        <option key={e.idEstacion} value={e.idEstacion}>{e.nombre}</option>
                    ))}
                </select>

                <ArrowRight size={18} aria-hidden="true" />

                <label htmlFor="select-destino" className="sr-only">Destino</label>
                <select
                    id="select-destino"
                    className="select"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    required
                >
                    <option value="">¿A dónde vas?</option>
                    {estacionesFiltradas.map((e) => (
                        <option key={e.idEstacion} value={e.idEstacion}>{e.nombre}</option>
                    ))}
                </select>

                <button type="submit" className="btn-primary" disabled={cargando}>
                    {cargando ? 'Calculando...' : 'Calcular ByPass'}
                </button>
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={guardarFavorito}
                    title="Guardar trayecto en 1 toque"
                    aria-label="Guardar trayecto en favoritos locales"
                >
                    <Bookmark size={16} />
                </button>
            </form>

            <label className="pmr-check">
                <input
                    type="checkbox"
                    checked={soloSinEscaleras}
                    onChange={(e) => setSoloSinEscaleras(e.target.checked)}
                />
                <Accessibility size={16} /> Solo estaciones accesibles (sin escaleras)
            </label>

            {error && <p className="error-text" role="alert">{error}</p>}

            {resultado && resultado.rutaRecomendada && (
                <div className="ruta-resultado" role="region" aria-label="Resultado de ruta calculada">
                    {resultado.hayAlertaBypass && resultado.mensajeBypass && (
                        <div className="bypass-banner" role="status">
                            <AlertTriangle size={17} />
                            <span>{resultado.mensajeBypass}</span>
                        </div>
                    )}

                    {renderOpcion(resultado.rutaRecomendada, true)}

                    {resultado.alternativas.length > 0 && (
                        <div className="intermodales">
                            <h4>Otras opciones evaluadas:</h4>
                            {resultado.alternativas.map((alt) => renderOpcion(alt, false))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}