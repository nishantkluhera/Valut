import React, { useState } from 'react';

function ApiKeyForm({ onSaveApiKey }) {
    const [apiKey, setApiKey] = useState('');

    const handleSaveApiKey = () => {
        onSaveApiKey(apiKey);
    };

    return (
        <div className="mb-3">
            <input
                type="text"
                className="form-control"
                placeholder="API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
            />
            <button className="btn btn-primary mt-2" onClick={handleSaveApiKey}>Save API Key</button>
        </div>
    );
}

export default ApiKeyForm;
