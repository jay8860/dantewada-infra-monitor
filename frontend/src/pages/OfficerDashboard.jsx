import React, { useState, useEffect } from 'react';
import api from '../api';
import { saveOfflineUpdate, getPendingUpdates, deletePendingUpdate } from '../offlineManager';
import { useAuth } from '../contexts/AuthContext';
import { MapPin, RefreshCw, LogOut, Search, Clock, AlertTriangle, CheckCircle, Calendar, ChevronLeft, ChevronRight, Camera } from 'lucide-react';
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
    const [selectedWork, setSelectedWork] = useState(null); // For Inspection Form
    const [searchTerm, setSearchTerm] = useState('');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Form State
    const [photo, setPhoto] = useState(null);
    const [status, setStatus] = useState('In Progress');
    const [location, setLocation] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [usingManualLoc, setUsingManualLoc] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        fetchWorks();
        checkPending();
    }, []);

    // Reset pagination when tab or search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, searchTerm]);

    const fetchWorks = async () => {
        setLoading(true);
        try {
            // Fetch ALL works to allow client-side search across everything
            // Increase limit to ensuring we get everything
            const response = await api.get('/works', { params: { limit: 10000 } });
            const data = response.data;
            setAllWorks(data);

            // Filter for 'My Assignments'
            if (user?.id) {
                // Use loose equality (==) as IDs might differ in type (string vs number)
                const myTasks = data.filter(w => w.assigned_officer_id == user.id);
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

    // --- Filtering & Pagination ---
    const getPaginatedData = () => {
        let sourceList = activeTab === 'assignments' ? assignedWorks : allWorks;

        // Search Filter
        if (searchTerm) {
            const low = searchTerm.toLowerCase();
            sourceList = sourceList.filter(w =>
                (w.work_name && w.work_name.toLowerCase().includes(low)) ||
                (w.work_code && w.work_code.toLowerCase().includes(low)) ||
                (w.block && w.block.toLowerCase().includes(low)) ||
                (w.panchayat && w.panchayat.toLowerCase().includes(low))
            );
        }

        const totalPages = Math.ceil(sourceList.length / ITEMS_PER_PAGE);
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const currentItems = sourceList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        return { currentItems, totalPages, totalCount: sourceList.length };
    };

    const { currentItems, totalPages, totalCount } = getPaginatedData();

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
        formData.append('remarks', ""); // Ensure remarks is sent
        formData.append('work_id', selectedWork.id);

        try {
            await api.post(`/works/${selectedWork.id}/inspections`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            alert("Update Successful!");
            setPhoto(null);
            setSelectedWork(null);
            fetchWorks();
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

    // --- Sync Logic ---
    const handleSync = async () => {
        const pending = await getPendingUpdates();
        if (pending.length === 0) return;

        setSubmitting(true);
        let successCount = 0;
        let errors = [];

        for (const item of pending) {
            const formData = new FormData();
            formData.append('status', item.status);
            formData.append('latitude', item.latitude);
            formData.append('longitude', item.longitude);
            // Append photo with filename
            if (item.photoBlob) {
                formData.append('photos', item.photoBlob, `offline_${item.workId}_${Date.now()}.jpg`);
            }
            formData.append('remarks', item.remarks || "");
            formData.append('work_id', item.workId);

            try {
                await api.post(`/works/${item.workId}/inspections`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                await deletePendingUpdate(item.id);
                successCount++;
            } catch (err) {
                console.error("Sync failed for item", item.id, err);
                errors.push(`ID ${item.workId}: ${err.response?.data?.detail || err.message}`);
            }
        }

        let msg = `Synced ${successCount} of ${pending.length} updates.`;
        if (errors.length > 0) {
            msg += `\nErrors:\n${errors.join('\n')}`;
        }
        alert(msg);

        checkPending();
        fetchWorks();
        setSubmitting(false);
    };

    const handleLogout = () => { logout(); navigate('/'); };

    // --- Render Form ---
    if (selectedWork) {
        return (
            <div className="flex flex-col h-screen bg-gray-50">
                <div className="bg-white p-4 shadow border-b flex items-center gap-4">
                    <button onClick={() => setSelectedWork(null)} className="text-blue-600 font-bold flex items-center gap-1">
                        <ChevronLeft size={20} /> Back
                    </button>
                    <h2 className="font-bold text-lg">Inspect Work</h2>
                </div>
                <div className="p-4 overflow-y-auto max-w-lg mx-auto w-full">
                    <div className="bg-white p-4 rounded-xl shadow-sm mb-6 border border-gray-100">
                        <h3 className="font-bold text-gray-900 text-lg leading-tight">{selectedWork.work_name}</h3>
                        <p className="text-sm text-gray-500 mt-2">{selectedWork.block} | {selectedWork.work_code}</p>
                        {selectedWork.inspection_deadline && (
                            <div className={`mt-3 inline-block px-3 py-1 text-xs font-semibold rounded-full border ${getDeadlineStatus(selectedWork.inspection_deadline).color}`}>
                                {getDeadlineStatus(selectedWork.inspection_deadline).label}
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Observation Status</label>
                            <select className="w-full border p-3 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" value={status} onChange={e => setStatus(e.target.value)}>
                                <option>In Progress</option>
                                <option>Completed</option>
                                <option>Stalled</option>
                                <option>Not Started</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Location</label>
                            <div className="flex gap-2">
                                <button type="button" onClick={getLocation} className="flex-1 bg-blue-50 text-blue-700 py-3 rounded-lg font-medium flex justify-center items-center gap-2 border border-blue-100 hover:bg-blue-100 transition">
                                    <MapPin size={18} /> Update GPS
                                </button>
                            </div>
                            {location && (
                                <p className="text-xs text-center mt-2 text-green-600 font-mono">Lat: {location.latitude.toFixed(5)}, Lng: {location.longitude.toFixed(5)}</p>
                            )}
                            {usingManualLoc && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <input placeholder="Lat" type="number" step="any" className="border p-2 rounded" onChange={e => setLocation(p => ({ ...p, latitude: e.target.value }))} />
                                    <input placeholder="Lng" type="number" step="any" className="border p-2 rounded" onChange={e => setLocation(p => ({ ...p, longitude: e.target.value }))} />
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Evidence Photo</label>
                            <div className="relative border-2 border-dashed border-gray-300 rounded-xl h-40 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition">
                                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={e => setPhoto(e.target.files[0])} />
                                {photo ? (
                                    <div className="text-center">
                                        <CheckCircle className="text-green-500 mx-auto mb-2" size={32} />
                                        <span className="text-sm text-green-700 font-medium">Photo Selected</span>
                                        <p className="text-xs text-gray-400 mt-1">{photo.name}</p>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <Camera size={32} className="text-gray-400 mx-auto mb-2" />
                                        <span className="text-sm text-gray-500 font-medium">Tap to Capture</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <button disabled={submitting} type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-200 transition disabled:opacity-70 disabled:cursor-not-allowed">
                            {submitting ? 'Uploading...' : 'Submit Inspection'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // --- Render Main Dashboard ---
    return (
        <div className="flex flex-col h-screen bg-gray-100 text-gray-800">
            {/* Header */}
            <header className="bg-blue-900 text-white p-4 shadow-md z-20 flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-lg font-bold tracking-tight">Officer Portal</h1>
                    <p className="text-[10px] text-blue-200 uppercase tracking-widest">{user?.username}</p>
                </div>
                <div className="flex items-center gap-3">
                    {pendingCount > 0 && (
                        <button onClick={handleSync} className="text-yellow-400 animate-pulse flex items-center gap-1 text-xs font-bold border border-yellow-400 px-2 py-1 rounded">
                            <RefreshCw size={14} /> Sync ({pendingCount})
                        </button>
                    )}
                    <button onClick={handleLogout} className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition">
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            {/* Controls */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="flex">
                    <button
                        onClick={() => setActiveTab('assignments')}
                        className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'assignments' ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
                    >
                        My Inspections ({assignedWorks.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('directory')}
                        className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'directory' ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
                    >
                        All Works ({allWorks.length})
                    </button>
                </div>
                <div className="p-3 border-t">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder={activeTab === 'assignments' ? "Search assignments..." : "Search all works..."}
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded-lg text-sm transition outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Content Table */}
            <div className="flex-1 overflow-auto p-4">
                {loading ? (
                    <div className="flex justify-center items-center h-40">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900"></div>
                    </div>
                ) : (
                    <>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-semibold border-b">
                                        <tr>
                                            <th className="px-4 py-3 w-16">ID</th>
                                            <th className="px-4 py-3">Work Name</th>
                                            <th className="px-4 py-3">Location</th>
                                            <th className="px-4 py-3">Status</th>
                                            {activeTab === 'assignments' && <th className="px-4 py-3">Deadline</th>}
                                            <th className="px-4 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {currentItems.length > 0 ? (
                                            currentItems.map((work) => (
                                                <tr key={work.id} className="hover:bg-blue-50/50 transition duration-150">
                                                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{work.id}</td>
                                                    <td className="px-4 py-3 max-w-xs">
                                                        <div className="font-bold text-gray-800 line-clamp-2">{work.work_name}</div>
                                                        <div className="text-xs text-gray-500 mt-1 font-mono">{work.work_code}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="text-gray-700">{work.panchayat}</div>
                                                        <div className="text-xs text-gray-500">{work.block}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex px-2 py-1 rounded text-xs font-bold uppercase ${work.current_status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                            work.current_status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
                                                                'bg-gray-100 text-gray-600'
                                                            }`}>
                                                            {work.current_status}
                                                        </span>
                                                    </td>
                                                    {activeTab === 'assignments' && (
                                                        <td className="px-4 py-3">
                                                            {work.inspection_deadline ? (
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${getDeadlineStatus(work.inspection_deadline).color}`}>
                                                                    <Clock size={10} className="mr-1" />
                                                                    {getDeadlineStatus(work.inspection_deadline).label}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">-</span>
                                                            )}
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            onClick={() => setSelectedWork(work)}
                                                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition transform active:scale-95"
                                                        >
                                                            INSPECT
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                                    No works found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex justify-between items-center mt-4 px-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 bg-white border rounded hover:bg-gray-50 disabled:opacity-50 shadow-sm"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="text-sm font-medium text-gray-600">
                                    Page {currentPage} of {totalPages}
                                    <span className="text-xs text-gray-400 ml-2">({totalCount} items)</span>
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 bg-white border rounded hover:bg-gray-50 disabled:opacity-50 shadow-sm"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default OfficerDashboard;
