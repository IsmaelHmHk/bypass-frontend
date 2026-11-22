import { useEffect, useState, type ReactNode } from 'react';
import { Users, RefreshCw, Radio, HelpCircle, CheckCircle2, AlertCircle, Flame } from 'lucide-react';
import { apiFetch } from '../api/apiClient';
import type { TrenActivo, VagonEstado } from '../types/bypass';
import { useAuth } from '../context/AuthContext';

const CONFIG_SATURACION: Record<string, { color: string; texto: string; icono: ReactNode }> = {
    SIN_DATOS: { color: '#64748b', texto: 'Sin datos aún', icono: <HelpCircle size={16} /> },
    VACIO: { color: '#16a34a', texto: 'Asientos libres', icono: <CheckCircle2 size={16} /> },
    MODERADO: { color: '#eab308', texto: 'Moderado', icono: <Users size={16} /> },
    LLENO: { color: '#ea580c', texto: 'Lleno', icono: <AlertCircle size={16} /> },
    COLAPSADO: { color: '#dc2626', texto: 'Colapsado', icono: <Flame size={16} /> },
};

export function TermometroVagones({ idLinea }: { idLinea: string }) {
    const { usuario } = useAuth();
    const [trenes, setTrenes] = useState<TrenActivo[]>([]);
    const [trenSeleccionado, setTrenSeleccionado] = useState<string>('');
    const [vagones, setVagones] = useState<VagonEstado[]>([]);
    const [mensaje, setMensaje] = useState<string>('');

    useEffect(() => {
        if (!idLinea) return;
        apiFetch<TrenActivo[]>(`/trenes/linea/${idLinea}`)
            .then((data) => {
                setTrenes(data);
                if (data.length > 0) setTrenSeleccionado(data[0].idTren);
                else {
                    setTrenSeleccionado('');
                    setVagones([]);
                }
            })
            .catch(() => setTrenes([]));
    }, [idLinea]);

    const cargarVagones = (idTren: string) => {
        if (!idTren) return;
        apiFetch<VagonEstado[]>(`/trenes/${idTren}/vagones`)
            .then(setVagones)
            .catch(() => setVagones([]));
    };

    useEffect(() => {
        cargarVagones(trenSeleccionado);
    }, [trenSeleccionado]);

    const reportarVagon = async (numeroVagon: number, nivel: string) => {
        if (!usuario) return;
        try {
            await apiFetch(`/trenes/${trenSeleccionado}/vagones/reportar`, {
                method: 'POST',
                body: JSON.stringify({ numeroVagon, nivelSaturacion: nivel }),
            });
            setMensaje(`Gracias: coche ${numeroVagon} actualizado.`);
            cargarVagones(trenSeleccionado);
        } catch (err) {
            setMensaje(err instanceof Error ? err.message : 'No se pudo guardar el reporte');
        }
    };

    const trenActual = trenes.find((t) => t.idTren === trenSeleccionado);

    return (
        <section className="card" aria-label="Ocupación por vagón en tiempo real">
            <div className="card-header">
                <h2><Users size={20} /> Ocupación por Vagón</h2>
                {trenSeleccionado && (
                    <button
                        type="button"
                        className="btn-icon"
                        onClick={() => cargarVagones(trenSeleccionado)}
                        aria-label="Refrescar ocupación de vagones"
                    >
                        <RefreshCw size={16} />
                    </button>
                )}
            </div>

            {trenActual && (
                <div className={`fuente-banner ${trenActual.fuenteDato === 'EN_VIVO_GTFS_RT' ? 'live' : 'degraded'}`}>
                    <Radio size={14} />
                    {trenActual.fuenteDato === 'EN_VIVO_GTFS_RT'
                        ? `Dato en vivo GTFS-RT · hace ${trenActual.antiguedadSegundos} s`
                        : 'Modo degradado · horario teórico (sin señal en vivo)'}
                </div>
            )}

            {trenes.length === 0 ? (
                <p className="muted">No hay vehículos activos reportados en esta línea en este momento.</p>
            ) : (
                <>
                    <label htmlFor="selector-tren" className="sr-only">Selecciona un tren activo</label>
                    <select
                        id="selector-tren"
                        className="select"
                        value={trenSeleccionado}
                        onChange={(e) => setTrenSeleccionado(e.target.value)}
                    >
                        {trenes.map((t) => (
                            <option key={t.idTren} value={t.idTren}>
                                {t.idTren} → {t.destino} ({t.estado}{t.minutosRetraso > 0 ? ` +${t.minutosRetraso} min` : ''})
                            </option>
                        ))}
                    </select>

                    <div className="vagones-grid">
                        {vagones.map((v) => {
                            const cfg = CONFIG_SATURACION[v.nivelSaturacion] || CONFIG_SATURACION.SIN_DATOS;
                            return (
                                <div
                                    key={v.numeroVagon}
                                    className="vagon-box"
                                    style={{ borderColor: cfg.color }}
                                    aria-label={`Coche ${v.numeroVagon}: ${cfg.texto}`}
                                >
                                    <span className="vagon-num">Coche {v.numeroVagon}</span>
                                    <strong className="vagon-estado" style={{ color: cfg.color }}>
                                        {cfg.icono} {cfg.texto}
                                    </strong>
                                    {v.nivelSaturacion !== 'SIN_DATOS' && (
                                        <small>{Math.round(v.scorePonderado)}% ocupación</small>
                                    )}

                                    {usuario && (
                                        <div className="vagon-actions" role="group" aria-label={`Reportar coche ${v.numeroVagon}`}>
                                            <button type="button" onClick={() => reportarVagon(v.numeroVagon, 'VACIO')}>Libre</button>
                                            <button type="button" onClick={() => reportarVagon(v.numeroVagon, 'LLENO')}>Lleno</button>
                                            <button type="button" onClick={() => reportarVagon(v.numeroVagon, 'COLAPSADO')}>Top</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {mensaje && <p className="feedback" role="status">{mensaje}</p>}
                </>
            )}
        </section>
    );
}