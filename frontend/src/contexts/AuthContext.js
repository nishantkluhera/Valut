import React, { createContext, useState } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [apiKey, setApiKey] = useState(localStorage.getItem('apiKey'));

    const login = (newToken) => {
        setToken(newToken);
        localStorage.setItem('token', newToken);
    };

    const logout = () => {
        setToken(null);
        localStorage.removeItem('token');
    };

    const saveApiKey = (key) => {
        setApiKey(key);
        localStorage.setItem('apiKey', key);
    };

    return (
        <AuthContext.Provider value={{ token, login, logout, apiKey, saveApiKey }}>
            {children}
        </AuthContext.Provider>
    );
};
