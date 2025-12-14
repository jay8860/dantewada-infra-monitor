import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../api';
import { jwtDecode } from "jwt-decode"; // Correct named import

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                // We should verify valid session with backend, but for now decode is enough to restore state
                setUser({ username: decoded.sub, role: localStorage.getItem('role') }); // role saved separately for convenience
            } catch (e) {
                console.error("Invalid token", e);
                localStorage.removeItem('token');
            }
        }
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);

        try {
            const response = await api.post('/token', params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            const { access_token, role } = response.data;

            localStorage.setItem('token', access_token);
            localStorage.setItem('role', role);

            const decoded = jwtDecode(access_token);
            setUser({ username: decoded.sub, role: role });
            return true;
        } catch (error) {
            console.error("Login failed", error);
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
