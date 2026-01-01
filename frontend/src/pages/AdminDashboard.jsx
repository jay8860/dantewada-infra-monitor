import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../api';
import MapComponent from '../components/MapComponent';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, Upload, LogOut, Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import WorkDetailDrawer from '../components/WorkDetailDrawer';

// Debounce helper
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

const AdminDashboard = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();

    // --- State: Data ---
    const [works, setWorks] = useState([]);
    const [mapWorks, setMapWorks] = useState([]); // Decoupled map data (all points)
    const [globalStats, setGlobalStats] = useState({ total: 0, completed: 0, in_progress: 0, not_started: 0 });
    const [filterOptions, setFilterOptions] = useState({ blocks: [], panchayats: [], departments: [], agencies: [], statuses: [], years: [] });
    const [officers, setOfficers] = useState([]);

    // --- State: Assignment ---
    const [assignmentModal, setAssignmentModal] = useState({ isOpen: false, workId: null, officerId: '', days: '' });

    // --- State: UI & Controls ---
    const [viewMode, setViewMode] = useState('table'); // 'table' or 'map'
    const [selectedWork, setSelectedWork] = useState(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mapLoading, setMapLoading] = useState(false);
    const [file, setFile] = useState(null);
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    // --- State: Sync ---
    const [syncModalOpen, setSyncModalOpen] = useState(false);
    const [sheetUrl, setSheetUrl] = useState('');
    const [syncing, setSyncing] = useState(false);

    // --- State: Filters, Sort & Pagination ---
    const [filters, setFilters] = useState({
        block: '',
        panchayat: '',
        department: '',
        status: '',
        agency: '',
        year: ''
    });
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 500);

    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    const [pagination, setPagination] = useState({
        page: 1,
        limit: 100,
        total: 0,
        totalPages: 0
    });

    const [visibleColumns, setVisibleColumns] = useState({
        work_name: true,
        department: true,
        block: true,
        sanctioned_amount: true,
        sanctioned_date: true,
        current_status: true,
        agency_name: true,
        financial_year: true,
        total_released_amount: true,
        amount_pending: true,
        probable_completion_date: true,
        remark: true,
        assignment: true // New default
    });

    // --- Fetch Global Data (Stats & Options) ---
    useEffect(() => {
        fetchGlobalData();
        fetchOfficers();
    }, []);

    const fetchOfficers = async () => {
        try {
            const res = await api.get('/officers');
            setOfficers(res.data);
        } catch (e) { console.error("Failed to fetch officers", e); }
    };

    const fetchGlobalData = async () => {
        try {
            const [statsRes, filtersRes] = await Promise.all([
                api.get('/works/stats'),
                api.get('/works/filters')
            ]);
            setGlobalStats(statsRes.data);
            setFilterOptions(filtersRes.data);
        } catch (error) {
            console.error("Failed to fetch global data", error);
        }
    };

    // --- Fetch TABLE Works (Paginated) ---
    const fetchWorks = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                skip: (pagination.page - 1) * pagination.limit,
                limit: pagination.limit,
                ...filters,
            };

            if (debouncedSearch) params.search = debouncedSearch;
            if (sortConfig.key) {
                params.sort_by = sortConfig.key;
                params.sort_order = sortConfig.direction;
            }

            // Remove empty filters
            Object.keys(params).forEach(key => {
                if (params[key] === '' || params[key] === null) delete params[key];
            });

            const response = await api.get('/works', { params });
            const totalCount = parseInt(response.headers['x-total-count'] || '0', 10);

            setWorks(response.data);
            setPagination(prev => ({
                ...prev,
                total: totalCount,
                totalPages: Math.ceil(totalCount / prev.limit)
            }));

        } catch (error) {
            console.error("Error fetching works", error);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, filters, debouncedSearch, sortConfig]);

    // --- Fetch MAP Works (All Points) ---
    const fetchMapWorks = useCallback(async () => {
        // Only fetch if in map mode
        if (viewMode !== 'map') return;

        setMapLoading(true);
        try {
            const params = { ...filters };
            if (debouncedSearch) params.search = debouncedSearch;

            // Remove empty filters
            Object.keys(params).forEach(key => {
                if (params[key] === '' || params[key] === null) delete params[key];
            });

            const response = await api.get('/works/locations', { params });
            setMapWorks(response.data);
        } catch (error) {
            console.error("Error fetching map locations", error);
        } finally {
            setMapLoading(false);
        }
    }, [viewMode, filters, debouncedSearch]);

    // Effects
    useEffect(() => {
        fetchWorks();
    }, [fetchWorks]); // Trigger table fetch

    useEffect(() => {
        fetchMapWorks();
    }, [fetchMapWorks]); // Trigger map fetch

    // Reset Page on Filter Change
    useEffect(() => {
        setPagination(prev => ({ ...prev, page: 1 }));
    }, [filters, debouncedSearch]);

    // --- Handlers ---
    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleViewDetails = async (workOrId) => {
        // If it's a lightweight map object, we might need to fetch details.
        // But WorkDetailDrawer usually expects a full object or ID.
        // Our API supports get /works/{id}.
        // If passed object has 'id', use it.
        let workData = workOrId;

        // If clicked from map, we might only have partial data.
        // Map objects have 'title' property while full objects have 'work_name'.
        // Also check if agency_name is missing (common missing field in map).
        if (workOrId.id && (workOrId.title || !workOrId.work_name || !workOrId.agency_name)) {
            try {
                // FORCE Fetch full details
                const res = await api.get(`/works/${workOrId.id}`);
                workData = res.data;
            } catch (e) {
                console.error("Failed to fetch details", e);
                // Fallback: alert user or show what we have
            }
        }

        setSelectedWork(workData);
        setIsDrawerOpen(true);
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            setPagination(prev => ({ ...prev, page: newPage }));
        }
    };

    const handleFileUpload = async () => {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            await api.post('/works/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert('File uploaded successfully');
            setFile(null);
            fetchWorks();
            fetchGlobalData();
        } catch (error) {
            console.error("Upload failed", error);
        }
    }

    const handleSyncSheet = async (useDefault = false) => {
        if (!useDefault && !sheetUrl) return;
        setSyncing(true);
        try {
            const formData = new FormData();
            if (!useDefault && sheetUrl) formData.append('sheet_url', sheetUrl);

            const res = await api.post('/works/sync-sheet', formData);
            alert(res.data.message);
            setSyncModalOpen(false);
            setSheetUrl('');
            fetchWorks();
        } catch (error) {
            console.error("Sync failed", error);
            alert(`Sync Failed: ${error.response?.data?.detail || error.message}`);
        } finally {
            setSyncing(false);
        }
    };


    const handleAssignClick = (work) => {
        setAssignmentModal({ isOpen: true, workId: work.id, officerId: work.assigned_officer_id || '', days: '' });
    };

    const submitAssignment = async () => {
        if (!assignmentModal.workId || !assignmentModal.officerId) return;

        try {
            const officerIdInt = parseInt(assignmentModal.officerId);
            if (isNaN(officerIdInt)) {
                alert("Invalid Officer ID selected.");
                return;
            }

            const payload = {
                officer_id: officerIdInt,
                deadline_days: assignmentModal.days ? parseInt(assignmentModal.days) : 7
            };
            console.log("Submitting assignment payload:", payload);

            await api.post(`/works/${assignmentModal.workId}/assign`, payload);
            alert('Assignment successful!');
            setAssignmentModal({ isOpen: false, workId: null, officerId: '', days: '' });
            fetchWorks(); // Refresh list
        } catch (e) {
            console.error("Assignment failed", e);
            alert(`Failed to assign work: ${JSON.stringify(e.response?.data?.detail || e.message)}`);
        }
    };

    const toggleColumn = (col) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };

    // --- Render Pagination Controls ---
    const renderPagination = () => {
        if (pagination.totalPages <= 1) return null;

        let pages = [];
        const { page, totalPages } = pagination;

        if (totalPages <= 7) {
            pages = Array.from({ length: totalPages }, (_, i) => i + 1);
        } else {
            if (page <= 4) {
                pages = [1, 2, 3, 4, 5, '...', totalPages];
            } else if (page >= totalPages - 3) {
                pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            } else {
                pages = [1, '...', page - 1, page, page + 1, '...', totalPages];
            }
        }

        return (
            <div className="flex items-center justify-center gap-2 py-4">
                <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"
                >
                    <ChevronLeft size={16} />
                </button>

                {pages.map((p, i) => (
                    <button
                        key={i}
                        onClick={() => typeof p === 'number' && handlePageChange(p)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition
                            ${p === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-600'}
                            ${typeof p !== 'number' ? 'cursor-default' : ''}
                        `}
                        disabled={typeof p !== 'number'}
                    >
                        {p}
                    </button>
                ))}

                <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"
                >
                    <ChevronRight size={16} />
                </button>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50 text-gray-800 font-sans">
            {/* Header with Global Stats */}
            <header className="bg-white border-b sticky top-0 z-30 px-6 py-3 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-500 text-xs">LOGOS</div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 leading-tight">Dantewada Work Monitor</h1>
                        <p className="text-xs text-blue-600 font-medium tracking-wide">DISTRICT ADMINISTRATION</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="hidden md:flex gap-6 text-sm">
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-gray-900">{globalStats.total?.toLocaleString() || 0}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Total Works</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-green-600">{globalStats.completed?.toLocaleString() || 0}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Completed</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-yellow-600">{globalStats.in_progress?.toLocaleString() || 0}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Ongoing</span>
                        </div>
                    </div>
                    <div className="h-8 w-px bg-gray-200"></div>
                    <button onClick={handleLogout} className="text-gray-500 hover:text-red-600 transition">
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-hidden flex flex-col">
                {/* Controls Bar */}
                <div className="bg-white p-4 border-b flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm z-20">
                    <div className="flex gap-4 w-full md:w-auto">
                        <div className="bg-gray-100 p-1 rounded-lg flex">
                            <button
                                onClick={() => setViewMode('table')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition ${viewMode === 'table' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <LayoutDashboard size={16} /> Table
                            </button>
                            <button
                                onClick={() => setViewMode('map')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition ${viewMode === 'map' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <MapPin size={16} /> Map
                            </button>
                        </div>

                        <div className="relative flex-1 md:w-64">
                            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search Name or Work Code..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 w-full md:w-auto items-center flex-wrap pb-2 md:pb-0">
                        {/* Dynamic Filters */}
                        <select
                            value={filters.block}
                            onChange={(e) => setFilters(p => ({ ...p, block: e.target.value }))}
                            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[150px]"
                        >
                            <option value="">All Blocks</option>
                            {filterOptions.blocks.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>

                        <select
                            value={filters.panchayat}
                            onChange={(e) => setFilters(p => ({ ...p, panchayat: e.target.value }))}
                            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[150px]"
                        >
                            <option value="">All GPs</option>
                            {filterOptions.panchayats?.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>

                        <select
                            value={filters.department}
                            onChange={(e) => setFilters(p => ({ ...p, department: e.target.value }))}
                            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[150px]"
                        >
                            <option value="">All Sectors</option>
                            {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>

                        <select
                            value={filters.agency}
                            onChange={(e) => setFilters(p => ({ ...p, agency: e.target.value }))}
                            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[150px]"
                        >
                            <option value="">All Agencies</option>
                            {filterOptions.agencies.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>

                        <select
                            value={filters.status}
                            onChange={(e) => setFilters(p => ({ ...p, status: e.target.value }))}
                            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Status</option>
                            {filterOptions.statuses.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        {/* Column Toggle */}
                        <div className="relative">
                            <button
                                onClick={() => setShowColumnMenu(!showColumnMenu)}
                                className="bg-white border hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 whitespace-nowrap"
                            >
                                <LayoutDashboard size={16} /> Columns
                            </button>
                            {showColumnMenu && (
                                <div className="absolute top-full right-0 mt-2 bg-white shadow-xl border p-3 rounded-lg w-56 z-50 grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Toggle Columns</h4>
                                    {Object.keys(visibleColumns).map(col => (
                                        <label key={col} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={visibleColumns[col]}
                                                onChange={() => toggleColumn(col)}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="capitalize">{col.replace(/_/g, ' ')}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Upload */}
                        <div className="relative group">
                            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition whitespace-nowrap">
                                <Upload size={16} /> <span className="hidden sm:inline">Upload CSV</span>
                                <input
                                    type="file"
                                    accept=".csv,.xlsx"
                                    onChange={(e) => setFile(e.target.files[0])}
                                    className="hidden"
                                />
                            </label>
                        </div>

                        {/* Google Sheet Sync */}
                        <div className="relative group">
                            <button
                                onClick={() => setSyncModalOpen(true)}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition whitespace-nowrap"
                            >
                                <ArrowUpDown size={16} /> <span className="hidden sm:inline">Sync GSheet</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 relative bg-gray-50 overflow-hidden">
                    {(loading || mapLoading) && (
                        <div className="absolute inset-0 bg-white/50 z-20 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    )}

                    {/* Sync Modal */}
                    {syncModalOpen && (
                        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
                            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
                                <h3 className="text-lg font-bold mb-2">Sync with Google Sheet</h3>
                                <div className="text-xs text-gray-500 mb-4 flex justify-between items-start">
                                    <p>Sync data from the District Master Sheet or a custom sheet.</p>
                                    {globalStats.last_sync && (
                                        <div className="text-right">
                                            <p className="font-semibold text-blue-600">Last Synced:</p>
                                            <p>{new Date(globalStats.last_sync).toLocaleString()}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <button
                                        onClick={() => handleSyncSheet(true)}
                                        disabled={syncing}
                                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow-md flex justify-center items-center gap-2"
                                    >
                                        {syncing ? 'Syncing...' : 'Sync with Main Sheet (Default)'}
                                    </button>

                                    <div className="relative flex items-center gap-2 my-2">
                                        <div className="h-px bg-gray-200 flex-1"></div>
                                        <span className="text-xs text-gray-400 font-medium">OR USE CUSTOM LINK</span>
                                        <div className="h-px bg-gray-200 flex-1"></div>
                                    </div>

                                    <div className="bg-gray-50 p-3 rounded-lg border">
                                        <input
                                            type="text"
                                            placeholder="https://docs.google.com/spreadsheets/d/..."
                                            className="w-full border rounded-lg p-2 text-sm mb-2 bg-white"
                                            value={sheetUrl}
                                            onChange={(e) => setSheetUrl(e.target.value)}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => setSyncModalOpen(false)}
                                                className="px-3 py-1.5 text-gray-600 font-medium hover:bg-gray-100 rounded text-xs"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => handleSyncSheet(false)}
                                                disabled={!sheetUrl || syncing}
                                                className="px-3 py-1.5 bg-gray-800 text-white font-medium rounded text-xs hover:bg-gray-900 disabled:opacity-50"
                                            >
                                                Sync Custom Sheet
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {viewMode === 'map' ? (
                        <div className="absolute inset-4 rounded-xl overflow-hidden border shadow-sm bg-white">
                            <MapComponent works={mapWorks} onWorkClick={handleViewDetails} />
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 px-4 py-2 rounded-full shadow-lg text-xs font-medium">
                                Showing {mapWorks.length} works (Full Dataset)
                            </div>
                        </div>
                    ) : (
                        <div className="h-full overflow-hidden flex flex-col">
                            {/* Table */}
                            {/* Table Card */}
                            <div className="flex-1 overflow-auto p-4">
                                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead className="bg-gray-50 border-b sticky top-0 z-10 w-full">
                                            <tr>
                                                <th className="p-4 font-semibold text-gray-600">#</th>
                                                {[
                                                    { key: 'work_name', label: 'Work Details' },
                                                    { key: 'department', label: 'Sector' },
                                                    { key: 'block', label: 'Location' },
                                                    { key: 'sanctioned_amount', label: 'Amount (Lakhs)' },
                                                    { key: 'sanctioned_date', label: 'Sanctioned Date' },
                                                    { key: 'current_status', label: 'Status' },
                                                    { key: 'agency_name', label: 'Agency' },
                                                    { key: 'financial_year', label: 'FY' },
                                                    { key: 'total_released_amount', label: 'Released' },
                                                    { key: 'amount_pending', label: 'Pending' },
                                                    { key: 'probable_completion_date', label: 'Est. End' },
                                                    { key: 'remark', label: 'Remarks' },
                                                    { key: 'assignment', label: 'Inspection Status' },
                                                ].map((col) => (
                                                    visibleColumns[col.key] && (
                                                        <th
                                                            key={col.key}
                                                            onClick={() => handleSort(col.key)}
                                                            className="p-4 font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                        >
                                                            <div className="flex items-center gap-1">
                                                                {col.label}
                                                                {sortConfig.key === col.key && (
                                                                    <ArrowUpDown size={12} className={sortConfig.direction === 'asc' ? 'text-blue-500' : 'text-blue-500 rotate-180'} />
                                                                )}
                                                            </div>
                                                        </th>
                                                    )
                                                ))}
                                                <th className="p-4 font-semibold text-gray-600 sticky right-0 bg-gray-50 drop-shadow-sm">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {works.map((work, idx) => (
                                                <tr key={work.id} className="hover:bg-blue-50/30 transition-colors group">
                                                    <td className="p-4 text-xs text-gray-400">
                                                        {(pagination.page - 1) * pagination.limit + idx + 1}
                                                    </td>
                                                    {visibleColumns.work_name && (
                                                        <td className="p-4 cursor-pointer" onClick={() => handleViewDetails(work)}>
                                                            <div className="font-medium text-blue-700 hover:underline line-clamp-2 w-64">{work.work_name}</div>
                                                            <div className="text-xs text-gray-500 font-mono mt-0.5">{work.work_code}</div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.department && (
                                                        <td className="p-4 whitespace-nowrap">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                                                {work.department}
                                                            </span>
                                                        </td>
                                                    )}
                                                    {visibleColumns.block && (
                                                        <td className="p-4 text-gray-600 whitespace-nowrap">
                                                            {work.panchayat}, {work.block}
                                                        </td>
                                                    )}
                                                    {visibleColumns.sanctioned_amount && (
                                                        <td className="p-4 text-gray-800 font-medium whitespace-nowrap">
                                                            ₹{work.sanctioned_amount?.toLocaleString()} Lakhs
                                                        </td>
                                                    )}
                                                    {visibleColumns.sanctioned_date && (
                                                        <td className="p-4 text-gray-600 whitespace-nowrap">
                                                            {work.sanctioned_date ? new Date(work.sanctioned_date).toLocaleDateString() : '-'}
                                                        </td>
                                                    )}
                                                    {visibleColumns.current_status && (
                                                        <td className="p-4 whitespace-nowrap">
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${work.current_status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                                work.current_status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
                                                                    'bg-red-100 text-red-700'
                                                                }`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${work.current_status === 'Completed' ? 'bg-green-500' :
                                                                    work.current_status === 'In Progress' ? 'bg-yellow-500' :
                                                                        'bg-red-500'
                                                                    }`}></span>
                                                                {work.current_status}
                                                            </span>
                                                        </td>
                                                    )}

                                                    {/* Extra Columns */}
                                                    {visibleColumns.agency_name && <td className="p-4 text-sm text-gray-600">{work.agency_name || '-'}</td>}
                                                    {visibleColumns.financial_year && <td className="p-4 text-sm text-gray-600">{work.financial_year}</td>}
                                                    {visibleColumns.total_released_amount && <td className="p-4 text-sm text-gray-600">₹{work.total_released_amount?.toLocaleString()} Lakhs</td>}
                                                    {visibleColumns.amount_pending && <td className="p-4 text-sm text-red-600">₹{work.amount_pending?.toLocaleString()} Lakhs</td>}
                                                    {visibleColumns.probable_completion_date && <td className="p-4 text-sm text-gray-600">{work.probable_completion_date ? new Date(work.probable_completion_date).toLocaleDateString() : '-'}</td>}
                                                    {visibleColumns.remark && <td className="p-4 text-sm text-gray-500 italic max-w-xs truncate">{work.remark || '-'}</td>}
                                                    {visibleColumns.assignment && (
                                                        <td className="p-4 whitespace-nowrap">
                                                            {work.assigned_officer ? (
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full w-fit">
                                                                        {work.assigned_officer.username}
                                                                    </span>
                                                                    {work.inspection_deadline && (
                                                                        <span className={`text-[10px] mt-0.5 ${new Date(work.inspection_deadline) < new Date() && work.assignment_status !== 'Completed' ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                                                            Due: {new Date(work.inspection_deadline).toLocaleDateString()}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleAssignClick(work); }}
                                                                    className="text-xs border border-dashed border-gray-400 text-gray-500 px-2 py-1 rounded hover:bg-gray-50 hover:text-blue-600 hover:border-blue-400 transition"
                                                                >
                                                                    + Assign
                                                                </button>
                                                            )}
                                                        </td>
                                                    )}

                                                    <td className="p-4 sticky right-0 bg-white group-hover:bg-blue-50/30">
                                                        <button
                                                            onClick={() => handleViewDetails(work)}
                                                            className="text-blue-600 hover:text-blue-800 text-xs font-semibold whitespace-nowrap"
                                                        >
                                                            Details
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {works.length === 0 && !loading && (
                                                <tr>
                                                    <td colSpan="10" className="p-8 text-center text-gray-500">
                                                        No works found matching your criteria.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Pagination */}
                            <div className="bg-white border-t p-2">
                                {renderPagination()}
                                <div className="text-center text-xs text-gray-400 mt-1">
                                    Displaying {works.length} of {pagination.total} works
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main >

            <WorkDetailDrawer
                work={selectedWork}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
            />

            {/* Assignment Modal */}
            {
                assignmentModal.isOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
                            <h3 className="text-lg font-bold mb-4">Assign Inspection</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Select Officer</label>
                                    <select
                                        className="w-full border rounded-lg p-2 text-sm"
                                        value={assignmentModal.officerId}
                                        onChange={(e) => setAssignmentModal(prev => ({ ...prev, officerId: e.target.value }))}
                                    >
                                        <option value="">-- Choose Officer --</option>
                                        {officers.map(off => (
                                            <option key={off.id} value={off.id}>{off.username} ({off.department || 'General'})</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Deadline (Days from now)</label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 7 (Leave empty for none)"
                                        className="w-full border rounded-lg p-2 text-sm"
                                        value={assignmentModal.days}
                                        onChange={(e) => setAssignmentModal(prev => ({ ...prev, days: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="mt-6 flex gap-3 justify-end">
                                <button
                                    onClick={() => setAssignmentModal({ isOpen: false, workId: null, officerId: '', days: '' })}
                                    className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitAssignment}
                                    disabled={!assignmentModal.officerId}
                                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Assign
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AdminDashboard;
