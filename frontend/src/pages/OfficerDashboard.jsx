import React, { useState, useEffect } from 'react';
import api from '../api';
import { saveOfflineUpdate, getPendingUpdates, deletePendingUpdate } from '../offlineManager';
import { useAuth } from '../contexts/AuthContext';
import { Camera, MapPin, Upload, RefreshCw, WifiOff, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const OfficerDashboard = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [works, setWorks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedWork, setSelectedWork] = useState(null);

    // Form State
    const [photo, setPhoto] = useState(null);
    const [status, setStatus] = useState('In Progress');
    const [location, setLocation] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Sync State
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        fetchWorks();
        checkPending();
    }, []);

    const fetchWorks = async () => {
        try {
            // In a real app, filter by officer's department or assignment
            // For now, fetch all but maybe we can add a simple filter if needed
            const response = await api.get('/works');
            // Client-side filter for demo if user has department
            let myWorks = response.data;
            if (user?.department) {
                myWorks = myWorks.filter(w => w.department === user.department || !w.department);
            }
            setWorks(myWorks);
        } catch (error) {
            console.error("Fetch works failed", error);
            // If offline, maybe show cached works? 
            // For MVP, we assume they loaded works once when online.
        } finally {
            setLoading(false);
        }
    };

    const checkPending = async () => {
        const pending = await getPendingUpdates();
        setPendingCount(pending.length);
    };

    const getLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
            },
            (error) => {
                alert('Unable to retrieve your location');
            }
        );
    };

    const handlePhotoChange = (e) => {
        if (e.target.files[0]) {
            setPhoto(e.target.files[0]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedWork || !photo || !location) {
            alert("Please fill all fields and capture location");
            return;
        }

        setSubmitting(true);
        const formData = new FormData();
        formData.append('status', status);
        formData.append('latitude', location.latitude);
        formData.append('longitude', location.longitude);
        formData.append('photos', photo);
        formData.append('work_id', selectedWork.id);

        try {
            // Try Online First
            await api.post(`/works/${selectedWork.id}/inspections`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert("Work updated successfully!");
            setPhoto(null);
            setSelectedWork(null);
            fetchWorks();
        } catch (error) {
            // If failed (likely offline), save to IDB
            if (window.confirm("Network request failed. Save offline to sync later?")) {
                await saveOfflineUpdate({
                    workId: selectedWork.id,
                    status,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    photoBlob: photo, // Store blob
                    timestamp: new Date().toISOString()
                });
                alert("Saved offline!");
                checkPending();
                setPhoto(null);
                setSelectedWork(null);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleSync = async () => {
        const pending = await getPendingUpdates();
        if (pending.length === 0) return;

        setSubmitting(true);
        let successCount = 0;

        for (const item of pending) {
            const formData = new FormData();
            formData.append('status', item.status);
            formData.append('latitude', item.latitude);
            formData.append('longitude', item.longitude);
            formData.append('photos', item.photoBlob, `offline_${item.workId}.jpg`);
            formData.append('work_id', item.workId);

            try {
                await api.post(`/works/${item.workId}/inspections`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                await deletePendingUpdate(item.id);
                successCount++;
            } catch (err) {
                console.error("Sync failed for item", item.id, err);
            }
        }
        alert(`Synced ${successCount} of ${pending.length} updates.`);
        checkPending();
        fetchWorks();
        setSubmitting(false);
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50 text-gray-800">
            <header className="bg-blue-800 text-white p-4 shadow flex justify-between items-center sticky top-0 z-20">
                <div>
                    <h1 className="text-lg font-bold">Officer App</h1>
                    <p className="text-xs opacity-80">{user?.username} | {user?.department || 'General'}</p>
                </div>
                <div className="flex gap-3">
                    {pendingCount > 0 && (
                        <button
                            onClick={handleSync}
                            disabled={submitting}
                            className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600 px-3 py-1 rounded text-xs font-bold animate-pulse"
                        >
                            <RefreshCw size={14} /> Sync ({pendingCount})
                        </button>
                    )}
                    <button onClick={handleLogout}><LogOut size={20} /></button>
                </div>
            </header>

            <main className="flex-1 overflow-auto p-4">
                {selectedWork ? (
                    <div className="bg-white rounded-lg shadow p-4 animate-in fade-in slide-in-from-bottom-4">
                        <button onClick={() => setSelectedWork(null)} className="text-sm text-blue-600 mb-4">&larr; Back to List</button>

                        <h2 className="font-bold text-lg mb-1">{selectedWork.work_name}</h2>
                        <p className="text-sm text-gray-500 mb-4">{selectedWork.block} | {selectedWork.panchayat}</p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold mb-1">Current Status</label>
                                <select
                                    className="w-full border p-2 rounded"
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                >
                                    <option value="Not Started">Not Started</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Completed">Completed</option>
                                </select>
                            </div>

                            <div className="border p-3 rounded bg-gray-50">
                                <label className="block text-sm font-semibold mb-2">Location Evidence</label>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-500">
                                        {location ? `Lat: ${location.latitude.toFixed(4)}, Long: ${location.longitude.toFixed(4)}` : "Location required"}
                                    </span>
                                    <button type="button" onClick={getLocation} className="flex gap-1 items-center bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm hover:bg-blue-200">
                                        <MapPin size={14} /> Get GPS
                                    </button>
                                </div>
                            </div>

                            <div className="border p-3 rounded bg-gray-50">
                                <label className="block text-sm font-semibold mb-2">Site Photo</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment" // Opens camera on mobile
                                    onChange={handlePhotoChange}
                                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 mt-4 shadow-lg flex justify-center items-center gap-2"
                            >
                                {submitting ? 'Sending...' : <>Submit Update <Upload size={18} /></>}
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Assigned Works</div>
                        {works.map(work => (
                            <div
                                key={work.id}
                                onClick={() => setSelectedWork(work)}
                                className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 active:scale-95 transition-transform cursor-pointer"
                            >
                                <div className="flex justify-between items-start">
                                    <h3 className="font-medium text-gray-900 line-clamp-2">{work.work_name}</h3>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${work.current_status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {work.current_status}
                                    </span>
                                </div>
                                <div className="mt-2 flex justify-between text-xs text-gray-500">
                                    <span>{work.block}</span>
                                    <span>ID: {work.work_code}</span>
                                </div>
                            </div>
                        ))}
                        {works.length === 0 && !loading && (
                            <div className="text-center text-gray-500 py-10">No works assigned.</div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default OfficerDashboard;
