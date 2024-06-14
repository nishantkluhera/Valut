import React, { useContext, useState, useEffect } from 'react';
import axios from 'axios';
import './styles/styles.css';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
import ApiKeyForm from './components/ApiKeyForm';
import { AuthContext, AuthProvider } from './contexts/AuthContext';
import 'bootstrap/dist/css/bootstrap.min.css';

function App() {
    const { token, login, apiKey, saveApiKey } = useContext(AuthContext);
    const [expenses, setExpenses] = useState([]);
    const [rewards, setRewards] = useState(0);

    useEffect(() => {
        if (token) {
            axios.get('/api/expenses', { headers: { 'x-auth-token': token } })
                .then(response => {
                    setExpenses(response.data);
                    setRewards(response.data.length);
                })
                .catch(error => console.error('Error fetching expenses:', error));
        }
    }, [token]);

    const handleAddExpense = (newExpense) => {
        setExpenses([...expenses, newExpense]);
        setRewards(rewards + 1);
    };

    return (
        <div className="container mt-5">
            <h1 className="text-center mb-4">Valut</h1>
            {token ? (
                <>
                    <ApiKeyForm onSaveApiKey={saveApiKey} />
                    {apiKey && (
                        <>
                            <ExpenseForm token={token} onAddExpense={handleAddExpense} />
                            <ExpenseList expenses={expenses} />
                            <div className="mt-4">
                                <h2>Rewards: {rewards}</h2>
                            </div>
                        </>
                    )}
                </>
            ) : (
                <>
                    <LoginForm onLogin={login} />
                    <RegisterForm onRegister={login} />
                </>
            )}
        </div>
    );
}

export default function AppWithProvider() {
    return (
        <AuthProvider>
            <App />
        </AuthProvider>
    );
}
