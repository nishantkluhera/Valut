import React, { useState } from 'react';
import axios from 'axios';

function LoginForm({ onLogin }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = () => {
        axios.post('/api/auth/login', { username, password })
            .then(response => onLogin(response.data.token))
            .catch(error => console.error('Error logging in:', error));
    };

    return (
        <div className="mb-3">
            <input
                type="text"
                className="form-control"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />
            <input
                type="password"
                className="form-control mt-2"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn btn-primary mt-2" onClick={handleLogin}>Login</button>
        </div>
    );
}

export default LoginForm;
