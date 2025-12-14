import React, { useState, useEffect } from 'react';
import MapComponent from '../components/MapComponent';
import api from '../api';
import { Link } from 'react-router-dom';

const PublicMap = () => {
    const [works, setWorks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWorks = async () => {
            try {
                const response = await api.get('/works');
                setWorks(response.data);
            } catch (error) {
                console.error("Failed to fetch works", error);
            } finally {
                setLoading(false);
            }
        };

        fetchWorks();
    }, []);

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            <header className="bg-blue-900 text-white p-4 shadow-lg flex justify-between items-center z-10">
                <div>
                    <h1 className="text-xl font-bold">Dantewada Work Monitor</h1>
                    <p className="text-xs opacity-75">Public Transparency Portal</p>
                </div>
                <Link to="/login" className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded text-sm font-semibold transition">
                    Officer Login
                </Link>
            </header>

            <main className="flex-1 relative">
                {loading ? (
                    <div className="flex h-full items-center justify-center">Loading Data...</div>
                ) : (
                    <MapComponent works={works} />
                )}
            </main>
        </div>
    );
};

export default PublicMap;
