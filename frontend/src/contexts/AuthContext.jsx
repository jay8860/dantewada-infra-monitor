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
                setUser({ 
                    username: decoded.sub, 
                    role: localStorage.getItem('role'),
                    id: localStorage.getItem('user_id') ? parseInt(localStorage.getItem('user_id')) : null,
                    allowed_agencies: localStorage.getItem('allowed_agencies') || ''
                });
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
            const { access_token, role, id, allowed_agencies } = response.data;

            localStorage.setItem('token', access_token);
            localStorage.setItem('role', role);
            if (id) localStorage.setItem('user_id', id);
            if (allowed_agencies) localStorage.setItem('allowed_agencies', allowed_agencies);

            const decoded = jwtDecode(access_token);
            setUser({ 
                username: decoded.sub, 
                role: role, 
                id: id, 
                allowed_agencies: allowed_agencies 
            });
            return true;
        } catch (error) {
            console.error("Login failed", error);
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('user_id');
        localStorage.removeItem('allowed_agencies');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
