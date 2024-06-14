import React, { useState } from 'react';
import axios from 'axios';

function RegisterForm({ onRegister }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleRegister = () => {
        axios.post('/api/auth/register', { username, password })
            .then(response => onRegister(response.data.token))
            .catch(error => console.error('Error registering:', error));
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
            <button className="btn btn-primary mt-2" onClick={handleRegister}>Register</button>
        </div>
    );
}

export default RegisterForm;
