import React from 'react';
import ReactDOM from 'react-dom/client';
import AppWithProvider from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <AppWithProvider />
    </React.StrictMode>
);
