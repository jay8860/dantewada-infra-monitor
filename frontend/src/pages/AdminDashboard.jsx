import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../api';
import MapComponent from '../components/MapComponent';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, Upload, LogOut, Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, Calendar, Users, Plus, Edit, UserX, CheckCircle } from 'lucide-react';
import WorkDetailDrawer from '../components/WorkDetailDrawer';
import MultiSelect from '../components/MultiSelect';
import VillageSummaryTable from '../components/VillageSummaryTable';
import UserManagementModal from '../components/UserManagementModal';

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
    const [summaryData, setSummaryData] = useState([]); // Village Summary Data
    const [globalStats, setGlobalStats] = useState({ total: 0, completed: 0, in_progress: 0, not_started: 0, cancelled: 0 });
    const [panchayatView, setPanchayatView] = useState(false); // New Filter for Summary View
    const [filterOptions, setFilterOptions] = useState({ blocks: [], panchayats: [], departments: [], agencies: [], statuses: [], years: [] });
    const [officers, setOfficers] = useState([]);

    // --- State: Search, Sort, Pagination ---
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 500);
    const [sortConfig, setSortConfig] = useState({ key: 'sanctioned_date', direction: 'desc' });
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [visibleColumns, setVisibleColumns] = useState({
        work_code: true,
        work_name: true,
        panchayat: true,
        block: true,
        department: true,
        agency_name: true,
        current_status: true,
        sanctioned_amount: true,
        sanctioned_date: true,
        financial_year: true,
        total_released_amount: true,
        amount_pending: true,
        probable_completion_date: false,
        photos: false,
        assignment: true,
        user_remark: true,
        photo_upload_date: true,
        reported_status: true
    });
    const [assignmentModal, setAssignmentModal] = useState({ isOpen: false, workId: null, officerId: '', days: '' });
    const [selectedWorks, setSelectedWorks] = useState([]);
    const [bulkAssignModal, setBulkAssignModal] = useState(false);

    // --- State: UI & Controls ---
    const [viewMode, setViewMode] = useState('table'); // 'table' or 'map'
    const [selectedWork, setSelectedWork] = useState(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mapLoading, setMapLoading] = useState(false);
    const [file, setFile] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    // --- State: Sync ---
    const [syncModalOpen, setSyncModalOpen] = useState(false);
    const [sheetUrl, setSheetUrl] = useState('');
    const [syncing, setSyncing] = useState(false);

    // --- State: User Management ---
    const [allUsers, setAllUsers] = useState([]);
    const [userModalOpen, setUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [usersLoading, setUsersLoading] = useState(false);

    // --- State: Filters ---
    const [filters, setFilters] = useState({
        block: '',
        panchayat: [], // Changed to array for MultiSelect
        department: '',
        status: [], // Changed to array for MultiSelect
        agency: '',
        year: ''
    });
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // --- Fetch TABLE Works (Paginated) ---
    const fetchWorks = useCallback(async () => {
        setLoading(true);
        try {
            // Manual Params Serialization for FastAPI (block=A&block=B)
            const params = new URLSearchParams();

            // Pagination
            params.append('skip', (pagination.page - 1) * pagination.limit);
            params.append('limit', pagination.limit);

            // Filters
            Object.keys(filters).forEach(key => {
                const val = filters[key];
                if (Array.isArray(val)) {
                    val.forEach(v => params.append(key, v));
                } else if (val) {
                    params.append(key, val);
                }
            });

            // Date Range
            if (dateRange.start) params.append('start_date', dateRange.start);
            if (dateRange.end) params.append('end_date', dateRange.end);

            if (debouncedSearch) params.append('search', debouncedSearch);
            if (sortConfig.key) {
                params.append('sort_by', sortConfig.key);
                params.append('sort_order', sortConfig.direction);
            }

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
    }, [pagination.page, pagination.limit, filters, dateRange, debouncedSearch, sortConfig]);

    // --- Fetch MAP Works (All Points) ---
    const fetchMapWorks = useCallback(async () => {
        if (viewMode !== 'map') return;
        setMapLoading(true);
        try {
            const params = new URLSearchParams();
            Object.keys(filters).forEach(key => {
                const val = filters[key];
                if (Array.isArray(val)) {
                    val.forEach(v => params.append(key, v));
                } else if (val) {
                    params.append(key, val);
                }
            });
            // Date Range for Map
            if (dateRange.start) params.append('start_date', dateRange.start);
            if (dateRange.end) params.append('end_date', dateRange.end);

            if (debouncedSearch) params.append('search', debouncedSearch);

            const response = await api.get('/works/locations', { params });
            setMapWorks(response.data);
        } catch (error) {
            console.error("Error fetching map locations", error);
        } finally {
            setMapLoading(false);
        }
    }, [viewMode, filters, dateRange, debouncedSearch]);

    // ... (keeping fetchSummary as is, or should update it too? User only asked for "showing works" which implies table list. 
    // Usually summary aggregation ignores detailed date filters unless requested. Staying safe.)

    // --- Fetch SUMMARY Data ---
    const fetchSummary = useCallback(async () => {
        if (viewMode !== 'summary') return;
        setLoading(true);
        try {
            // Pass current filters
            const params = new URLSearchParams();
            if (filters.department) params.append('department', filters.department);
            if (filters.year) params.append('year', filters.year);
            if (panchayatView) params.append('panchayat_view', 'true'); // New Param

            const response = await api.get('/works/summary/village', { params });
            setSummaryData(response.data);
        } catch (error) {
            console.error("Error fetching summary", error);
        } finally {
            setLoading(false);
        }
    }, [viewMode, filters.department, filters.year, panchayatView]);

    // ...

    // Inject "District/Block Level Works" into Blocks
    const blockOptions = useMemo(() => {
        const base = filterOptions.blocks || [];
        if (!base.includes("District/Block Level Works")) {
            return [...base, "District/Block Level Works"];
        }
        return base;
    }, [filterOptions.blocks]);

    // --- Effects: Initial Fetch ---
    useEffect(() => {
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

        const fetchOfficers = async () => {
            try {
                const res = await api.get('/officers');
                setOfficers(res.data);
            } catch (e) { console.error("Failed to fetch officers", e); }
        };

        fetchGlobalData();
        fetchOfficers();
    }, []);

    // Effects: Triggers
    useEffect(() => {
        fetchWorks();
    }, [fetchWorks]);

    useEffect(() => {
        fetchMapWorks();
    }, [fetchMapWorks]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    // Reset Page on Filter Change
    useEffect(() => {
        setPagination(prev => ({ ...prev, page: 1 }));
    }, [filters, dateRange, debouncedSearch]);

    // Bulk Select logic
    const toggleSelectWork = (id) => {
        setSelectedWorks(prev => prev.includes(id) ? prev.filter(wid => wid !== id) : [...prev, id]);
    };
    const toggleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedWorks(works.map(w => w.id));
        } else {
            setSelectedWorks([]);
        }
    };

    const handleBulkAssign = async () => {
        if (selectedWorks.length === 0) {
            alert("No works selected.");
            return;
        }
        if (!assignmentModal.officerId) {
            alert("Please select an agency/officer.");
            return;
        }
        setLoading(true);
        try {
            await api.put('/works/bulk-assign', {
                work_ids: selectedWorks,
                username: assignmentModal.officerId,
                deadline_days: assignmentModal.days ? parseInt(assignmentModal.days) : null
            });
            alert("Bulk assignment successful!");
            setSelectedWorks([]);
            setBulkAssignModal(false);
            setAssignmentModal({ isOpen: false, workId: null, officerId: '', days: '' });
            fetchWorks();
        } catch (error) {
            alert("Failed to assign works.");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };


    // --- Handlers ---
    const handleSort = (key) => {
        setSortConfig(current => {
            if (current.key !== key) {
                return { key, direction: 'desc' };
            }
            return {
                key,
                direction: current.direction === 'desc' ? 'asc' : 'desc'
            };
        });
    };

    const handleViewDetails = async (workOrId) => {
        let workData = workOrId;
        if (workOrId.id && (workOrId.title || !workOrId.work_name || !workOrId.agency_name)) {
            try {
                const res = await api.get(`/works/${workOrId.id}`);
                workData = res.data;
            } catch (e) {
                console.error("Failed to fetch details", e);
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

    const handleAdminUpdate = async (workId, field, value) => {
        try {
            // Optimistic Update (optional, but good for UI)
            setWorks(prev => prev.map(w => w.id === workId ? { ...w, [field]: value } : w));

            await api.put(`/works/${workId}/admin`, {
                [field]: value
            });
        } catch (error) {
            console.error("Update failed", error);
            // Revert? For now just alert.
            // alert("Failed to save change");
        }
    };

    const resetFilters = () => {
        setFilters({
            block: '',
            panchayat: [],
            department: '',
            status: [],
            agency: '',
            year: ''
        });
        setDateRange({ start: '', end: '' });
        setSearchTerm('');
    };

    const handleDownload = async () => {
        setDownloading(true);
        try {
            // Build params same as fetchWorks
            const params = new URLSearchParams();
            Object.keys(filters).forEach(key => {
                const val = filters[key];
                if (Array.isArray(val)) {
                    val.forEach(v => params.append(key, v));
                } else if (val) {
                    params.append(key, val);
                }
            });
            if (debouncedSearch) params.append('search', debouncedSearch);
            if (sortConfig.key) {
                params.append('sort_by', sortConfig.key);
                params.append('sort_order', sortConfig.direction);
            }

            const response = await api.get('/works/export', {
                params,
                responseType: 'blob'
            });

            // Create Blob link to download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Dantewada_Works_${new Date().toISOString().slice(0, 10)}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Download failed", error);
            alert("Failed to download Excel file.");
        } finally {
            setDownloading(false);
        }
    };

    const handleExportInspectionStatus = async () => {
        setDownloading(true);
        try {
            const response = await api.get('/reports/inspection-status', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `inspection_status_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Export inspection status failed", error);
            alert("Failed to export inspection report.");
        } finally {
            setDownloading(false);
        }
    };

    const handleAssignClick = (work) => {
        setAssignmentModal({ isOpen: true, workId: work.id, officerId: work.assigned_officer_id || '', days: '' });
    };

    const submitAssignment = async () => {
        if (!assignmentModal.workId || !assignmentModal.officerId) return;
        try {
            const payload = {
                officer_id: parseInt(assignmentModal.officerId),
                deadline_days: assignmentModal.days ? parseInt(assignmentModal.days) : 7
            };
            await api.post(`/works/${assignmentModal.workId}/assign`, payload);
            alert('Assignment successful!');
            setAssignmentModal({ isOpen: false, workId: null, officerId: '', days: '' });
            fetchWorks();
        } catch (e) {
            console.error("Assignment failed", e);
            alert(`Failed: ${e.response?.data?.detail || e.message}`);
        }
    };

    const toggleColumn = (col) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };

    // --- User Management Functions ---
    const fetchUsers = async () => {
        setUsersLoading(true);
        try {
            const res = await api.get('/users');
            setAllUsers(res.data);
        } catch (err) {
            console.error('Failed to fetch users', err);
        } finally {
            setUsersLoading(false);
        }
    };

    const handleDeactivateUser = async (u) => {
        const action = u.is_active !== false ? 'deactivate' : 'reactivate';
        if (!confirm(`Are you sure you want to ${action} "${u.username}"?`)) return;
        try {
            if (u.is_active !== false) {
                await api.delete(`/users/${u.id}`);
            } else {
                await api.put(`/users/${u.id}`, { is_active: true });
            }
            fetchUsers();
        } catch (err) {
            console.error(`Failed to ${action} user`, err);
            alert(`Failed: ${err.response?.data?.detail || err.message}`);
        }
    };

    const renderPagination = () => {
        if (pagination.totalPages <= 1) return null;
        let pages = [];
        const { page, totalPages } = pagination;
        if (totalPages <= 7) {
            pages = Array.from({ length: totalPages }, (_, i) => i + 1);
        } else {
            if (page <= 4) pages = [1, 2, 3, 4, 5, '...', totalPages];
            else if (page >= totalPages - 3) pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            else pages = [1, '...', page - 1, page, page + 1, '...', totalPages];
        }
        return (
            <div className="flex items-center justify-center gap-2 py-4">
                <button onClick={() => handlePageChange(page - 1)} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
                {pages.map((p, i) => (
                    <button key={i} onClick={() => typeof p === 'number' && handlePageChange(p)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition ${p === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-600'} ${typeof p !== 'number' ? 'cursor-default' : ''}`} disabled={typeof p !== 'number'}>{p}</button>
                ))}
                <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50 text-gray-800 font-sans">
            <header className="bg-white border-b sticky top-0 z-30 px-6 py-3 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-3">
                    <img
                        src="https://dantewada.nic.in/wp-content/themes/district-theme-9/images/emblem-dark.png"
                        alt="Dantewada Emblem"
                        className="h-12 w-auto object-contain"
                    />
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
                            <span className="font-bold text-blue-600">{globalStats.in_progress?.toLocaleString() || 0}</span>
                            <span className="text-[10px] text-gray-500 uppercase">In Progress</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-gray-600">{globalStats.not_started?.toLocaleString() || 0}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Not Started</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-red-600">{globalStats.cc_pending?.toLocaleString() || 0}</span>
                            <span className="text-[10px] text-gray-500 uppercase">CC Not Come</span>
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
                            {/* ... buttons ... */}
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
                            <button
                                onClick={() => setViewMode('summary')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition ${viewMode === 'summary' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <LayoutDashboard size={16} className="rotate-90" /> Summary
                            </button>
                            <button
                                onClick={() => { setViewMode('users'); fetchUsers(); }}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition ${viewMode === 'users' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Users size={16} /> Users
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
                        {/* Reset Button */}
                        <button
                            onClick={resetFilters}
                            className="bg-gray-100 border hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                            title="Reset all filters"
                        >
                            <RotateCcw size={16} /> Reset
                        </button>

                        {/* Dynamic Filters */}
                        {/* Single Select Filters */}
                        <select
                            className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-32"
                            value={filters.block}
                            onChange={(e) => setFilters(p => ({ ...p, block: e.target.value }))}
                        >
                            <option value="">All Blocks</option>
                            {blockOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>

                        <MultiSelect
                            options={filterOptions.panchayats}
                            value={filters.panchayat}
                            onChange={(val) => setFilters(p => ({ ...p, panchayat: val }))}
                            placeholder="Panchayat..."
                            label=""
                            showSearch={true}
                        />

                        <select
                            className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-32"
                            value={filters.department}
                            onChange={(e) => setFilters(p => ({ ...p, department: e.target.value }))}
                        >
                            <option value="">All Sectors</option>
                            {filterOptions.departments.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>

                        <select
                            className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-32"
                            value={filters.agency}
                            onChange={(e) => setFilters(p => ({ ...p, agency: e.target.value }))}
                        >
                            <option value="">All Agencies</option>
                            {filterOptions.agencies.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>

                        <MultiSelect
                            options={filterOptions.statuses}
                            value={filters.status}
                            onChange={(val) => setFilters(p => ({ ...p, status: val }))}
                            placeholder="Status..."
                            label=""
                            showSearch={false}
                        />

                        {/* Date Filters */}
                        <div className="flex items-center gap-2 bg-white border rounded-lg px-2 py-1.5 shadow-sm h-[38px]">
                            <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Calendar size={12} /> AS Date</span>
                            <div className="h-4 w-px bg-gray-200"></div>
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))}
                                className="text-xs outline-none text-gray-700 w-[110px] bg-transparent"
                                placeholder="From"
                            />
                            <span className="text-gray-400 text-xs">-</span>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))}
                                className="text-xs outline-none text-gray-700 w-[110px] bg-transparent"
                                placeholder="To"
                            />
                            {/* Today shortcut */}
                            <button
                                onClick={() => {
                                    const today = new Date().toISOString().split('T')[0];
                                    setDateRange(p => ({ ...p, end: today }));
                                }}
                                className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 font-bold hover:bg-blue-100 uppercase tracking-wide"
                            >
                                Today
                            </button>
                        </div>

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



                        {/* Google Sheet Sync */}
                        {/* Google Sheet Sync & Export */}
                        <div className="flex gap-4 items-center">
                            <button
                                onClick={() => setSyncModalOpen(true)}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition whitespace-nowrap"
                            >
                                <ArrowUpDown size={16} /> <span className="hidden sm:inline">Sync GSheet</span>
                            </button>

                            {/* Bulk Assign */}
                            <button
                                onClick={() => {
                                    if (selectedWorks.length === 0) return alert("Select works to attach");
                                    setBulkAssignModal(true);
                                }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition whitespace-nowrap ${selectedWorks.length > 0 ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                            >
                                <span className="hidden sm:inline">Bulk Assign ({selectedWorks.length})</span>
                            </button>

                            {/* Download Excel */}
                            <button
                                onClick={handleDownload}
                                disabled={downloading}
                                className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition whitespace-nowrap disabled:opacity-50"
                            >
                                {downloading ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <Upload size={16} className="rotate-180" />
                                )}
                                <span className="hidden sm:inline">Export Works</span>
                            </button>
                            
                            {/* Export Inspection Status */}
                            <button
                                onClick={handleExportInspectionStatus}
                                disabled={downloading}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition whitespace-nowrap disabled:opacity-50 shadow-sm"
                            >
                                {downloading ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <Upload size={16} className="rotate-180" />
                                )}
                                <span className="hidden sm:inline">Export Status Report</span>
                            </button>

                            {/* Panchayat View Toggle (Summary Only) */}
                            {viewMode === 'summary' && (
                                <label className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium border border-blue-200 cursor-pointer hover:bg-blue-100 transition whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={panchayatView}
                                        onChange={(e) => setPanchayatView(e.target.checked)}
                                        className="rounded text-blue-600 focus:ring-blue-500"
                                    />
                                    Panchayat View (CEO Janpad Only)
                                </label>
                            )}
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
                    ) : viewMode === 'summary' ? (
                        <VillageSummaryTable data={summaryData} />
                    ) : viewMode === 'users' ? (
                        /* ====== USER MANAGEMENT VIEW ====== */
                        <div className="h-full overflow-auto p-4">
                            <div className="bg-white rounded-xl shadow-sm border">
                                {/* Header */}
                                <div className="p-4 border-b flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Users size={20} /> User Management</h2>
                                        <p className="text-xs text-gray-500 mt-0.5">Create and manage user access to the portal</p>
                                    </div>
                                    <button
                                        onClick={() => { setEditingUser(null); setUserModalOpen(true); }}
                                        className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm hover:shadow-md"
                                    >
                                        <Plus size={14} /> Create User
                                    </button>
                                </div>

                                {/* User Table */}
                                {usersLoading ? (
                                    <div className="flex justify-center py-12">
                                        <div className="animate-spin h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 border-b">
                                            <tr>
                                                <th className="p-4 font-semibold text-gray-600">#</th>
                                                <th className="p-4 font-semibold text-gray-600">Username</th>
                                                <th className="p-4 font-semibold text-gray-600">Role</th>
                                                <th className="p-4 font-semibold text-gray-600">Department</th>
                                                <th className="p-4 font-semibold text-gray-600">Access Scope</th>
                                                <th className="p-4 font-semibold text-gray-600">Status</th>
                                                <th className="p-4 font-semibold text-gray-600">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {allUsers.map((u, idx) => (
                                                <tr key={u.id} className="hover:bg-blue-50/30 transition-colors">
                                                    <td className="p-4 text-gray-400 text-xs">{idx + 1}</td>
                                                    <td className="p-4 font-medium text-gray-800">{u.username}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {u.role === 'admin' ? '🔑 Admin' : '👤 Officer'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-gray-600">{u.department || <span className="text-gray-400 italic">All</span>}</td>
                                                    <td className="p-4">
                                                        {u.allowed_blocks || u.allowed_panchayats || u.allowed_agencies ? (
                                                            <div className="text-xs space-y-0.5">
                                                                {u.allowed_agencies && <div><span className="font-medium text-gray-500">Agencies:</span> {u.allowed_agencies}</div>}
                                                                {u.allowed_blocks && <div><span className="font-medium text-gray-500">Blocks:</span> {u.allowed_blocks}</div>}
                                                                {u.allowed_panchayats && <div><span className="font-medium text-gray-500">GPs:</span> {u.allowed_panchayats}</div>}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-gray-400 italic">Full Access</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                            {u.is_active !== false ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => { setEditingUser(u); setUserModalOpen(true); }}
                                                                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"
                                                                title="Edit User"
                                                            >
                                                                <Edit size={14} />
                                                            </button>
                                                            {u.username !== 'admin' && (
                                                                <button
                                                                    onClick={() => handleDeactivateUser(u)}
                                                                    className={`p-1.5 rounded-lg transition ${u.is_active !== false ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                                                                    title={u.is_active !== false ? 'Deactivate' : 'Reactivate'}
                                                                >
                                                                    {u.is_active !== false ? <UserX size={14} /> : <CheckCircle size={14} />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
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
                                                <th className="p-4 bg-gray-50">
                                                    <input 
                                                        type="checkbox" 
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        onChange={toggleSelectAll}
                                                        checked={works.length > 0 && selectedWorks.length === works.length}
                                                    />
                                                </th>
                                                <th className="p-4 font-semibold text-gray-600">#</th>
                                                {[
                                                    { key: 'work_name', label: 'Work Details' },
                                                    { key: 'department', label: 'Sector' },
                                                    { key: 'block', label: 'Location' },
                                                    { key: 'sanctioned_amount', label: 'Amount (Lakhs)' },
                                                    { key: 'sanctioned_date', label: 'AS Date' },
                                                    { key: 'current_status', label: 'Status' },
                                                    { key: 'agency_name', label: 'Agency' },
                                                    { key: 'financial_year', label: 'FY' },
                                                    { key: 'total_released_amount', label: 'Released (Lakhs)' },
                                                    { key: 'amount_pending', label: 'Pending (Lakhs)' },
                                                    { key: 'probable_completion_date', label: 'Est. End' },
                                                    { key: 'photos', label: 'Photos' },
                                                    { key: 'assignment', label: 'Inspection Status' },
                                                    { key: 'user_remark', label: 'User Remark' },
                                                    { key: 'photo_upload_date', label: 'Photo Date' },
                                                    { key: 'reported_status', label: 'Reported Status' },
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

                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {works.map((work, idx) => (
                                                <tr key={work.id} className={`transition-colors group ${selectedWorks.includes(work.id) ? 'bg-blue-50/50' : 'hover:bg-blue-50/30'}`}>
                                                    <td className="p-4">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                            checked={selectedWorks.includes(work.id)}
                                                            onChange={() => toggleSelectWork(work.id)}
                                                        />
                                                    </td>
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
                                                            {work.panchayat}
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
                                                    {visibleColumns.photos && (
                                                        <td className="p-4">
                                                            {work.first_thumbnail ? (
                                                                <img
                                                                    src={`${import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:8000'}/${work.first_thumbnail}`}
                                                                    alt="Work photo"
                                                                    className="w-12 h-12 rounded-lg object-cover border border-gray-200 shadow-sm cursor-pointer hover:scale-110 transition-transform"
                                                                    onClick={() => handleViewDetails(work)}
                                                                />
                                                            ) : (
                                                                <span className="text-xs text-gray-300">—</span>
                                                            )}
                                                        </td>
                                                    )}
                                                    {visibleColumns.assignment && (
                                                        <td className="p-4 whitespace-nowrap">
                                                            {/* ... assignment content ... */}
                                                        </td>
                                                    )}
                                                    {visibleColumns.user_remark && <td className="p-4 text-sm text-gray-600 whitespace-pre-wrap min-w-[150px]">{work.user_remark || '-'}</td>}
                                                    {visibleColumns.photo_upload_date && <td className="p-4 text-sm text-gray-600 whitespace-nowrap">{work.photo_upload_date ? new Date(work.photo_upload_date).toLocaleDateString() : '-'}</td>}
                                                    {visibleColumns.reported_status && <td className="p-4 text-sm font-medium text-blue-600 whitespace-nowrap">{work.reported_status || '-'}</td>}
                                                    {/* NOTE: I am fixing offset line issues by replacing the whole block or finding a better anchor */}                                                    {/* Deadline Input */}
                                                    {visibleColumns.inspection_deadline && (
                                                        <td className="p-4">
                                                            <input
                                                                type="date"
                                                                className="border rounded px-2 py-1 text-xs w-32 focus:ring-2 focus:ring-blue-500 outline-none"
                                                                value={work.inspection_deadline ? new Date(work.inspection_deadline).toISOString().split('T')[0] : ''}
                                                                onChange={(e) => handleAdminUpdate(work.id, 'inspection_deadline', e.target.value)}
                                                            />
                                                        </td>
                                                    )}

                                                    {/* Days Left Countdown */}
                                                    {visibleColumns.inspection_deadline && (
                                                        <td className="p-4">
                                                            {(() => {
                                                                if (!work.inspection_deadline) return <span className="text-gray-400 text-xs">-</span>;
                                                                const diff = new Date(work.inspection_deadline) - new Date();
                                                                const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                                                                let color = "text-gray-600";
                                                                if (work.assignment_status !== 'Completed') {
                                                                    if (days < 0) color = "text-red-600 font-bold"; // Delayed
                                                                    else if (days <= 7) color = "text-yellow-600 font-bold"; // Warning
                                                                    else color = "text-green-600 font-bold"; // Safe
                                                                }
                                                                return <span className={`text-xs ${color}`}>{days} Days</span>;
                                                            })()}
                                                        </td>
                                                    )}



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

            {/* User Management Modal */}
            <UserManagementModal
                user={editingUser}
                isOpen={userModalOpen}
                onClose={() => { setUserModalOpen(false); setEditingUser(null); }}
                onSave={() => fetchUsers()}
                filterOptions={filterOptions}
            />

            {/* Bulk Assignment Modal */}
            {
                bulkAssignModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
                            <h3 className="text-lg font-bold mb-4">Bulk Assign Inspection ({selectedWorks.length} works)</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Select Officer/Agency</label>
                                    <select
                                        className="w-full border rounded-lg p-2 text-sm"
                                        value={assignmentModal.officerId}
                                        onChange={(e) => setAssignmentModal(prev => ({ ...prev, officerId: e.target.value }))}
                                    >
                                        <option value="">-- Choose Agency --</option>
                                        {officers.map(off => (
                                            <option key={off.id} value={off.username}>{off.username} ({off.allowed_agencies || 'All'})</option>
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
                                    onClick={() => setBulkAssignModal(false)}
                                    className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleBulkAssign}
                                    disabled={!assignmentModal.officerId}
                                    className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    Assign All ({selectedWorks.length})
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Target Assignment Modal */}
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
