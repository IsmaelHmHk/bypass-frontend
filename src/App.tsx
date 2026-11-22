import { useEffect, useState } from 'react';
import { MapPin, Bookmark, AlertCircle, SlidersHorizontal } from 'lucide-react';
import { apiFetch } from './api/apiClient';
import type { Linea, ReporteIncidencia } from './types/bypass';
import { useAuth } from './context/AuthContext';
import { MapaCercanas } from './components/MapaCercanas';
import { BuscadorRutas } from './components/BuscadorRutas';
import { TermometroVagones } from './components/TermometroVagones';
import {
    guardarLineasCache,
    indexarColoresPorCodigoCorto,
    leerCatalogoCache,
    leerLineasCache,
    obtenerEstiloChipLinea,
    type EstacionCatalogo,
} from './data/estacionesMadrid';

type PestanaMovil = 'MAPA' | 'LO_DE_SIEMPRE' | 'AVISOS';

export default function App() {
    const { usuario } = useAuth();
    const [pestana, setPestana] = useState<PestanaMovil>('MAPA');
    const [estaciones, setEstaciones] = useState<EstacionCatalogo[]>(() => leerCatalogoCache());
    const [lineas, setLineas] = useState<Linea[]>(() => leerLineasCache() as Linea[]);
    const [coloresPorCodigo, setColoresPorCodigo] = useState<Record<string, string>>(() =>
        indexarColoresPorCodigoCorto(leerLineasCache())
    );
    const [lineaActiva, setLineaActiva] = useState<string>('');
    const [incidencias, setIncidencias] = useState<ReporteIncidencia[]>([]);
    const [destinoSeleccionado, setDestinoSeleccionado] = useState<string>('');
    const [ajustesAbiertos, setAjustesAbiertos] = useState<boolean>(false);

    useEffect(() => {
        apiFetch<EstacionCatalogo[]>('/catalogo/estaciones')
            .then((data) => {
                if (Array.isArray(data)) {
                    setEstaciones(data);
                }
            })
            .catch(() => {});

        apiFetch<Linea[]>('/catalogo/lineas')
            .then((data) => {
                if (Array.isArray(data) && data.length > 0) {
                    setLineas(data);
                    guardarLineasCache(data);
                    setColoresPorCodigo(indexarColoresPorCodigoCorto(data));
                    setLineaActiva((prev) => prev || data[0].idLinea);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (pestana !== 'AVISOS' || !lineaActiva) return;
        apiFetch<ReporteIncidencia[]>(`/incidencias/linea/${encodeURIComponent(lineaActiva)}`)
            .then((data) => setIncidencias(Array.isArray(data) ? data : []))
            .catch(() => setIncidencias([]));
    }, [pestana, lineaActiva]);

    const irHastaParada = (idEstacion: string) => {
        setDestinoSeleccionado(idEstacion);
        setPestana('LO_DE_SIEMPRE');
    };

    const estacionesParaRutas = estaciones.map((e) => ({
        idEstacion: e.idEstacion,
        codigoParada: e.codigoParada,
        nombre: e.nombre,
        ordenParada: null,
        tiempoSiguienteMin: null,
        latitud: e.latitud,
        longitud: e.longitud,
        accesiblePmr: e.accesiblePmr,
        tieneEnlaceMetro: (e.lineas || []).some((l: string) => /^L\d+/i.test(l)),
        tieneEnlaceBus: false,
    }));

    return (
        <div className="app-shell">
            <header className="topbar">
                <span className="brand-name">ByPass</span>

                <div className="topbar-actions">
                    {usuario && <span className="viajero-id">ID #{usuario.idUsuario}</span>}
                    <button
                        type="button"
                        className="btn-ajuste"
                        aria-expanded={ajustesAbiertos}
                        onClick={() => setAjustesAbiertos((prev) => !prev)}
                    >
                        <SlidersHorizontal size={13} />
                        <span>Ajustes</span>
                    </button>
                </div>
            </header>

            {ajustesAbiertos && (
                <section className="ajustes-box" aria-label="Ajustes de la aplicación">
                    <span>Caché local de estaciones y líneas activa</span>
                    <span>Las salidas marcadas como Teórico proceden de datos reales programados.</span>
                </section>
            )}

            <main className="main-movil">
                {pestana === 'MAPA' && (
                    <MapaCercanas
                        onSeleccionarDestino={irHastaParada}
                        visible={pestana === 'MAPA'}
                    />
                )}

                {pestana === 'LO_DE_SIEMPRE' && (
                    <div className="vista-pestana">
                        <BuscadorRutas
                            estaciones={estacionesParaRutas}
                            destinoPreseleccionado={destinoSeleccionado}
                        />
                    </div>
                )}

                {pestana === 'AVISOS' && (
                    <div className="vista-pestana">
                        <section className="tarjeta-simple">
                            <h2>Línea</h2>
                            <div className="lineas-selector">
                                {lineas.map((l) => {
                                    const activa = lineaActiva === l.idLinea;
                                    const estiloBase = obtenerEstiloChipLinea(
                                        l.codigoCorto,
                                        coloresPorCodigo
                                    );
                                    return (
                                        <button
                                            key={l.idLinea}
                                            type="button"
                                            className="linea-btn"
                                            style={{
                                                backgroundColor: activa ? estiloBase.backgroundColor : '#FAF8F4',
                                                color: activa ? estiloBase.color : '#242424',
                                                borderColor: estiloBase.backgroundColor,
                                                border: estiloBase.border || `1px solid ${estiloBase.backgroundColor}`,
                                            }}
                                            onClick={() => setLineaActiva(l.idLinea)}
                                        >
                                            {l.codigoCorto}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="tarjeta-simple" aria-label="Avisos de línea">
                            <h2>Avisos</h2>
                            {incidencias.length === 0 ? (
                                <p className="sin-incidencias">Sin incidencias comunicadas</p>
                            ) : (
                                incidencias.map((inc) => (
                                    <div key={inc.idReporte} className="incidencia-fila">
                                        <div className="aviso-incidencia">
                                            {inc.tipoIncidencia} · {inc.estadoVerificacion}
                                        </div>
                                        {inc.descripcion && <div>{inc.descripcion}</div>}
                                    </div>
                                ))
                            )}
                        </section>

                        {lineaActiva && <TermometroVagones idLinea={lineaActiva} />}
                    </div>
                )}
            </main>

            <nav className="bottom-nav" aria-label="Navegación">
                <button
                    type="button"
                    className={pestana === 'MAPA' ? 'active' : ''}
                    onClick={() => setPestana('MAPA')}
                >
                    <MapPin size={17} />
                    <span>Mapa</span>
                </button>
                <button
                    type="button"
                    className={pestana === 'LO_DE_SIEMPRE' ? 'active' : ''}
                    onClick={() => setPestana('LO_DE_SIEMPRE')}
                >
                    <Bookmark size={17} />
                    <span>Lo de siempre</span>
                </button>
                <button
                    type="button"
                    className={pestana === 'AVISOS' ? 'active' : ''}
                    onClick={() => setPestana('AVISOS')}
                >
                    <AlertCircle size={17} />
                    <span>Avisos</span>
                </button>
            </nav>
        </div>
    );
}