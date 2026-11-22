import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiFetch, setAccessToken } from '../api/apiClient';
import type { AuthUsuario } from '../types/bypass';

interface AuthContextType {
    usuario: Omit<AuthUsuario, 'accessToken' | 'expiresInSeconds'> | null;
    listo: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [usuario, setUsuario] = useState<Omit<AuthUsuario, 'accessToken' | 'expiresInSeconds'> | null>(null);
    const [listo, setListo] = useState(false);

    useEffect(() => {
        const inicializarViajero = async () => {
            try {
                const data = await apiFetch<AuthUsuario>('/auth/refresh', { method: 'POST' }, false);
                setAccessToken(data.accessToken);
                setUsuario({
                    idUsuario: data.idUsuario,
                    nombre: data.nombre,
                    rol: data.rol,
                    trustScore: data.trustScore,
                });
            } catch {
                try {
                    const nueva = await apiFetch<AuthUsuario>('/auth/anonimo', { method: 'POST' }, false);
                    setAccessToken(nueva.accessToken);
                    setUsuario({
                        idUsuario: nueva.idUsuario,
                        nombre: nueva.nombre,
                        rol: nueva.rol,
                        trustScore: nueva.trustScore,
                    });
                } catch {
                    setUsuario(null);
                }
            } finally {
                setListo(true);
            }
        };

        inicializarViajero();
    }, []);

    return (
        <AuthContext.Provider value={{ usuario, listo }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
    return ctx;
}