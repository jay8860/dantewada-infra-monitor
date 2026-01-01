
import React, { useState, useEffect } from 'react';
import api from '../api';
import { saveOfflineUpdate, getPendingUpdates, deletePendingUpdate } from '../offlineManager';
import { useAuth } from '../contexts/AuthContext';
import { MapPin, Upload, RefreshCw, LogOut, Search, Clock, AlertTriangle, CheckCircle, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const OfficerDashboard = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    // Data State
    const [allWorks, setAllWorks] = useState([]); // Master list
    const [assignedWorks, setAssignedWorks] = useState([]); // Filtered assignments
    const [loading, setLoading] = useState(true);

    // UI State
    const [activeTab, setActiveTab] = useState('assignments'); // 'assignments' | 'directory'
    const [selectedWork, setSelectedWork] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Pagination (Directory Tab)
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Form State
    const [photo, setPhoto] = useState(null);
    const [status, setStatus] = useState('In Progress');
    const [location, setLocation] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [usingManualLoc, setUsingManualLoc] = useState(false);

    // Sync State
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        fetchWorks();
        checkPending();
    }, []);

    const fetchWorks = async () => {
        setLoading(true);
        try {
            // Fetch ALL works (for directory) and filter assignments locally
            const response = await api.get('/works');
            const data = response.data;
            setAllWorks(data);

            // Filter for 'My Assignments'
            // Match assigned_officer_id to user.id
            if (user?.id) {
                const myTasks = data.filter(w => w.assigned_officer_id === user.id);
                setAssignedWorks(myTasks);
            }
        } catch (error) {
            console.error("Fetch works failed", error);
        } finally {
            setLoading(false);
        }
    };

    const checkPending = async () => {
        const pending = await getPendingUpdates();
        setPendingCount(pending.length);
    };

    // --- Helpers ---
    const getDeadlineStatus = (deadlineStr) => {
        if (!deadlineStr) return { color: 'bg-gray-100 text-gray-600', label: 'No Deadline' };

        const deadline = new Date(deadlineStr);
        const today = new Date();
        const diffTime = deadline - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { color: 'bg-red-100 text-red-700 border-red-200', label: `Overdue (${Math.abs(diffDays)}d)` };
        if (diffDays <= 3) return { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: `Due in ${diffDays}d` };
        return { color: 'bg-green-100 text-green-700 border-green-200', label: `Due in ${diffDays}d` };
    };

    // --- Directory Filtering & Pagination ---
    const getFilteredDirectory = () => {
        let filtered = allWorks;
        // Search
        if (searchTerm) {
            const low = searchTerm.toLowerCase();
            filtered = filtered.filter(w =>
                w.work_name?.toLowerCase().includes(low) ||
                w.work_code?.toLowerCase().includes(low) ||
                w.block?.toLowerCase().includes(low)
            );
        }
        // Paginate
        const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

        return { items: pageItems, totalPages, totalCount: filtered.length };
    };

    const { items: directoryItems, totalPages } = getFilteredDirectory();

    // --- Form Logic ---
    const getLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported');
            setUsingManualLoc(true);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
                setUsingManualLoc(false);
            },
            (err) => {
                console.error("GPS Error", err);
                alert("GPS failed. Enter manually.");
                setUsingManualLoc(true);
            },
            { enableHighAccuracy: true, timeout: 15000 }
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedWork || !photo || (!location && !usingManualLoc)) {
            alert("Please fill all fields and capture location");
            return;
        }

        setSubmitting(true);
        const formData = new FormData();
        formData.append('status', status);
        formData.append('latitude', location?.latitude || 0);
        formData.append('longitude', location?.longitude || 0);
        formData.append('photos', photo);
        formData.append('work_id', selectedWork.id);

        try {
            await api.post(`/works/${selectedWork.id}/inspections`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            alert("Update Successful!");
            setPhoto(null);
            setSelectedWork(null);
            fetchWorks(); // Refresh status
        } catch (error) {
            if (window.confirm("Network request failed. Save offline?")) {
                await saveOfflineUpdate({
                    workId: selectedWork.id,
                    status,
                    latitude: location?.latitude || 0,
                    longitude: location?.longitude || 0,
                    photoBlob: photo,
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

    const handleSync = async () => { /* Same sync logic */
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

    const handleLogout = () => { logout(); navigate('/'); };

    // --- Render ---

    if (selectedWork) {
        // Inspection Form View (Same as before but cleaner)
        return (
            <div className="flex flex-col h-screen bg-gray-50">
                <div className="bg-white p-4 shadow border-b text-center relative">
                    <button onClick={() => setSelectedWork(null)} className="absolute left-4 top-4 text-blue-600 font-bold">&larr; Back</button>
                    <h2 className="font-bold">Inspect Work</h2>
                </div>
                <div className="p-4 overflow-y-auto">
                    <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                        <h3 className="font-bold text-gray-900">{selectedWork.work_name}</h3>
                        <p className="text-sm text-gray-500 mt-1">{selectedWork.block} | {selectedWork.work_code}</p>
                        {selectedWork.inspection_deadline && (
                            <div className={`mt-2 inline-block px-2 py-1 text-xs rounded border ${getDeadlineStatus(selectedWork.inspection_deadline).color}`}>
                                Deadline: {getDeadlineStatus(selectedWork.inspection_deadline).label}
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-xl shadow-sm">
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Observation Status</label>
                            <select className="w-full border p-3 rounded-lg bg-gray-50" value={status} onChange={e => setStatus(e.target.value)}>
                                <option>In Progress</option>
                                <option>Completed</option>
                                <option>Stalled</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Location</label>
                            <div className="flex gap-2">
                                <button type="button" onClick={getLocation} className="flex-1 bg-blue-50 text-blue-700 py-3 rounded-lg font-medium flex justify-center items-center gap-2">
                                    <MapPin size={18} /> Update GPS
                                </button>
                            </div>
                            {location && (
                                <p className="text-xs text-center mt-2 text-green-600">Lat: {location.latitude.toFixed(4)}, Lng: {location.longitude.toFixed(4)}</p>
                            )}
                            {usingManualLoc && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <input placeholder="Lat" type="number" className="border p-2 rounded" onChange={e => setLocation(p => ({ ...p, latitude: e.target.value }))} />
                                    <input placeholder="Lng" type="number" className="border p-2 rounded" onChange={e => setLocation(p => ({ ...p, longitude: e.target.value }))} />
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Evidence Photo</label>
                            <div className="relative border-2 border-dashed border-gray-300 rounded-xl h-32 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition">
                                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setPhoto(e.target.files[0])} />
                                <Camera size={24} className="text-gray-400 mb-2" />
                                <span className="text-xs text-gray-400">{photo ? 'Photo Selected' : 'Tap to Capture'}</span>
                            </div>
                        </div>

                        <button disabled={submitting} type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-200">
                            {submitting ? 'Uploading...' : 'Submit Inspection'}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-screen bg-gray-100 text-gray-800">
            {/* Header */}
            <header className="bg-blue-900 text-white p-4 shadow-md z-20 flex justify-between items-center">
                <div>
                    <h1 className="text-lg font-bold tracking-tight">Officer Portal</h1>
                    <p className="text-[10px] text-blue-200 uppercase tracking-widest">{user?.username}</p>
                </div>
                <div className="flex items-center gap-3">
                    {pendingCount > 0 && <button onClick={handleSync} className="text-yellow-400 animate-pulse"><RefreshCw size={20} /></button>}
                    <button onClick={handleLogout} className="text-white/80 hover:text-white"><LogOut size={20} /></button>
                </div>
            </header>

            {/* Tabs */}
            <div className="bg-white border-b flex">
                <button
                    onClick={() => setActiveTab('assignments')}
                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'assignments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
                >
                    My Inspections ({assignedWorks.length})
                </button>
                <button
                    onClick={() => setActiveTab('directory')}
                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'directory' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
                >
                    All Works
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'assignments' ? (
                    <div className="space-y-4">
                        {assignedWorks.length === 0 ? (
                            <div className="text-center py-10 text-gray-400 bg-white rounded-xl shadow-sm border border-dashed">
                                <CheckCircle size={40} className="mx-auto mb-2 opacity-20" />
                                <p>No pending inspections assigned.</p>
                            </div>
                        ) : (
                            assignedWorks.map(work => {
                                const status = getDeadlineStatus(work.inspection_deadline);
                                return (
                                    <div key={work.id} onClick={() => setSelectedWork(work)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2 active:scale-[0.98] transition-transform">
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-bold text-gray-900 leading-snug line-clamp-2">{work.work_name}</h3>
                                            {work.inspection_deadline && (
                                                <div className={`shrink-0 w-3 h-3 rounded-full ${status.color.split(' ')[0]}`} />
                                            )}
                                        </div>

                                        <div className="flex justify-between items-end mt-1">
                                            <div className="text-xs text-gray-500 space-y-1">
                                                <p className="flex items-center gap-1"><MapPin size={10} /> {work.block}, {work.panchayat}</p>
                                                <p className="font-mono bg-gray-50 px-1 rounded inline-block">{work.work_code}</p>
                                            </div>

                                            {work.inspection_deadline ? (
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                                                    No Date
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Search */}
                        <div className="sticky top-0 bg-gray-100 pb-2 pt-1 z-10">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                <input
                                    className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Search works directory..."
                                    value={searchTerm}
                                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                />
                            </div>
                        </div>

                        {directoryItems.map(work => (
                            <div key={work.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 opacity-75">
                                <h3 className="font-bold text-gray-800 text-sm line-clamp-1">{work.work_name}</h3>
                                <div className="flex justify-between mt-2 text-xs text-gray-500">
                                    <span>{work.block}</span>
                                    <span>{work.current_status}</span>
                                </div>
                            </div>
                        ))}

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex justify-center gap-4 items-center py-4">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                    className="p-2 rounded-full bg-white shadow disabled:opacity-30"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <span className="text-xs font-bold text-gray-500">Page {currentPage} of {totalPages}</span>
                                <button
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    className="p-2 rounded-full bg-white shadow disabled:opacity-30"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OfficerDashboard;
