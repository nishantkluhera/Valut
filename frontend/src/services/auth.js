import api from './api';

export const register = async (username, password) => {
    const response = await api.post('/auth/register', { username, password });
    return response.data;
};

export const login = async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    return response.data;
};
