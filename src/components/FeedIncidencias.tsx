import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../api/apiClient';
import type { ReporteIncidencia } from '../types/bypass';
import { useAuth } from '../context/AuthContext';

export function FeedIncidencias({ idLinea }: { idLinea: string }) {
    const { usuario } = useAuth();
    const [incidencias, setIncidencias] = useState<ReporteIncidencia[]>([]);
    const [tipo, setTipo] = useState('RETRASO');
    const [descripcion, setDescripcion] = useState('');
    const [error, setError] = useState('');

    const cargarIncidencias = () => {
        if (!idLinea) return;
        apiFetch<ReporteIncidencia[]>(`/incidencias/linea/${idLinea}`)
            .then(setIncidencias)
            .catch(() => setIncidencias([]));
    };

    useEffect(() => {
        cargarIncidencias();
    }, [idLinea]);

    const enviarReporte = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await apiFetch('/incidencias', {
                method: 'POST',
                body: JSON.stringify({
                    idLinea,
                    tipoIncidencia: tipo,
                    descripcion: descripcion.trim() || null,
                }),
            });
            setDescripcion('');
            cargarIncidencias();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al enviar reporte');
        }
    };

    const votar = async (idReporte: number, esVeridico: boolean) => {
        setError('');
        try {
            await apiFetch(`/incidencias/${idReporte}/votar`, {
                method: 'POST',
                body: JSON.stringify({ esVeridico }),
            });
            cargarIncidencias();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo registrar tu voto');
        }
    };

    return (
        <section className="card" aria-label="Incidencias verificadas en tiempo real">
            <div className="card-header">
                <h2><AlertTriangle size={20} /> Incidencias Verificadas</h2>
            </div>

            {usuario && (
                <form onSubmit={enviarReporte} className="form-inline">
                    <label htmlFor="tipo-incidencia" className="sr-only">Tipo de incidencia</label>
                    <select id="tipo-incidencia" className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                        <option value="RETRASO">Retraso</option>
                        <option value="AVERIA_TREN">Avería de tren</option>
                        <option value="AGLOMERACION">Aglomeración en andén</option>
                        <option value="CORTE_VIA">Corte de vía</option>
                        <option value="INFRAESTRUCTURA">Infraestructura / Señalización</option>
                    </select>
                    <label htmlFor="desc-incidencia" className="sr-only">Descripción</label>
                    <input
                        id="desc-incidencia"
                        className="input"
                        type="text"
                        maxLength={500}
                        placeholder="Describe qué ocurre (máx. 500 caracteres)..."
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                    />
                    <button type="submit" className="btn-primary">Reportar</button>
                </form>
            )}

            {error && <p className="error-text" role="alert">{error}</p>}

            <div className="lista-incidencias">
                {incidencias.length === 0 ? (
                    <p className="muted">Sin incidencias reportadas en esta línea.</p>
                ) : (
                    incidencias.map((inc) => (
                        <div key={inc.idReporte} className={`incidencia-item estado-${inc.estadoVerificacion.toLowerCase()}`}>
                            <div className="inc-top">
                                <span className="badge">{inc.tipoIncidencia}</span>
                                <span className={`estado-pill ${inc.estadoVerificacion.toLowerCase()}`}>
                  {inc.estadoVerificacion} (Peso: {inc.pesoConfianza})
                </span>
                            </div>
                            {inc.descripcion && <p className="inc-desc">{inc.descripcion}</p>}
                            <div className="inc-footer">
                <span className="autor-meta">
                  <ShieldCheck size={14} /> {inc.autor} · Trust {inc.trustScoreAutor}
                </span>
                                {usuario && usuario.nombre !== inc.autor && (
                                    <div className="voto-btns" role="group" aria-label="¿Sigue pasando?">
                                        <button type="button" onClick={() => votar(inc.idReporte, true)} className="btn-ok">
                                            <CheckCircle size={14} /> Sí, sigue
                                        </button>
                                        <button type="button" onClick={() => votar(inc.idReporte, false)} className="btn-ko">
                                            <XCircle size={14} /> Falso / Resuelto
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </section>
    );
}