import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import MapComponent from '../components/MapComponent';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, Upload, LogOut, Search, Filter, ArrowUpDown } from 'lucide-react';
import WorkDetailDrawer from '../components/WorkDetailDrawer';

const AdminDashboard = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [works, setWorks] = useState([]);
    const [file, setFile] = useState(null);
    const [viewMode, setViewMode] = useState('table'); // 'table' or 'map'
    const [selectedWork, setSelectedWork] = useState(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const handleViewDetails = (work) => {
        setSelectedWork(work);
        setIsDrawerOpen(true);
    };

    // Column Visibility State
    const [visibleColumns, setVisibleColumns] = useState({
        work_name: true,
        department: true,
        block: true,
        sanctioned_amount: true,
        sanctioned_date: true,
        current_status: true,
        agency_name: false,
        financial_year: false,
        total_released_amount: false,
        amount_pending: false,
        completion_timelimit_days: false,
        probable_completion_date: false,
        remark: false
    });

    const [showColumnMenu, setShowColumnMenu] = useState(false);

    const toggleColumn = (col) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };

    // Filter & Sort State
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({
        block: '',
        panchayat: '',
        department: '',
        status: '',
        agency: ''
    });
    const [sortConfig, setSortConfig] = useState({ key: 'last_updated', direction: 'desc' });

    const [allBlocks, setAllBlocks] = useState([]);
    const [allPanchayats, setAllPanchayats] = useState([]);
    const [allDepts, setAllDepts] = useState([]);
    const [allAgencies, setAllAgencies] = useState([]);
    const [allStatus, setAllStatus] = useState([]);

    const fetchWorks = async () => {
        try {
            const response = await api.get('/works');
            const data = Array.isArray(response.data) ? response.data : [];
            setWorks(data);

            // Extract unique values for filters
            setAllBlocks([...new Set(data.map(w => w.block).filter(Boolean))].sort());
            setAllPanchayats([...new Set(data.map(w => w.panchayat).filter(Boolean))].sort());
            setAllDepts([...new Set(data.map(w => w.department).filter(Boolean))].sort());
            setAllAgencies([...new Set(data.map(w => w.agency_name).filter(Boolean))].sort());
            setAllStatus([...new Set(data.map(w => w.current_status).filter(Boolean))].sort());
        } catch (error) {
            console.error("Error fetching works", error);
            setWorks([]);
        }
    };

    useEffect(() => {
        fetchWorks();
    }, []);

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
        } catch (error) {
            console.error("Upload failed", error);
            alert('Upload failed');
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredWorks = useMemo(() => {
        let items = [...works];

        // Filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            items = items.filter(w =>
                w.work_name?.toLowerCase().includes(term) ||
                w.work_code?.toLowerCase().includes(term)
            );
        }
        if (filters.block) items = items.filter(w => w.block === filters.block);
        if (filters.panchayat) items = items.filter(w => w.panchayat === filters.panchayat);
        if (filters.department) items = items.filter(w => w.department === filters.department);
        if (filters.status) items = items.filter(w => w.current_status === filters.status);
        if (filters.agency) items = items.filter(w => w.agency_name === filters.agency);

        // Sort
        items.sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];

            if (sortConfig.key === 'last_updated' || sortConfig.key === 'sanctioned_date') {
                aVal = new Date(aVal || 0).getTime();
                bVal = new Date(bVal || 0).getTime();
            } else if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return items;
    }, [works, searchTerm, filters, sortConfig]);

    const stats = {
        total: works.length,
        completed: works.filter(w => w.current_status === 'Completed').length,
        inProgress: works.filter(w => w.current_status === 'In Progress').length,
        notStarted: works.filter(w => w.current_status === 'Not Started').length
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50 text-gray-800 font-sans">
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
                            <span className="font-bold text-gray-900">{stats.total}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Total Works</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-green-600">{stats.completed}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Completed</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-yellow-600">{stats.inProgress}</span>
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
                                placeholder="Search works..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 w-full md:w-auto items-center overflow-x-auto pb-2 md:pb-0">
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

                        <select
                            value={filters.panchayat}
                            onChange={(e) => setFilters({ ...filters, panchayat: e.target.value })}
                            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[150px]"
                        >
                            <option value="">All GPs</option>
                            {allPanchayats.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>

                        <select
                            value={filters.department}
                            onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[150px]"
                        >
                            <option value="">All Depts</option>
                            {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>

                        <select
                            value={filters.agency}
                            onChange={(e) => setFilters({ ...filters, agency: e.target.value })}
                            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[150px]"
                        >
                            <option value="">All Agencies</option>
                            {allAgencies.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>

                        <select
                            value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Status</option>
                            {allStatus.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <div className="relative group">
                            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition whitespace-nowrap">
                                <Upload size={16} /> <span className="hidden sm:inline">Upload CSV</span>
                                <input
                                    type="file"
                                    accept=".csv,.xlsx"
                                    onChange={(e) => {
                                        setFile(e.target.files[0]);
                                    }}
                                    className="hidden"
                                />
                            </label>
                            {file && (
                                <div className="absolute top-full right-0 mt-2 bg-white shadow-lg border p-3 rounded w-48 z-50">
                                    <p className="text-xs truncate mb-2">{file.name}</p>
                                    <button onClick={handleFileUpload} className="w-full bg-green-600 text-white text-xs py-1 rounded">Confirm Upload</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 relative bg-gray-50 overflow-hidden">
                    {viewMode === 'map' ? (
                        <div className="absolute inset-4 rounded-xl overflow-hidden border shadow-sm bg-white">
                            <MapComponent works={sortedAndFilteredWorks} />
                        </div>
                    ) : (
                        <div className="h-full overflow-auto p-4">
                            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead className="bg-gray-50 border-b sticky top-0 z-10 w-full">
                                            <tr>
                                                {[
                                                    { key: 'work_name', label: 'Work Details' },
                                                    { key: 'department', label: 'Department' },
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
                                                ].map((col) => (
                                                    visibleColumns[col.key] && (
                                                        <th
                                                            key={col.key}
                                                            className="p-4 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                                                            onClick={() => handleSort(col.key)}
                                                        >
                                                            <div className="flex items-center gap-1">
                                                                {col.label}
                                                                {sortConfig.key === col.key && (
                                                                    <ArrowUpDown size={12} className={sortConfig.direction === 'asc' ? 'rotate-180' : ''} />
                                                                )}
                                                            </div>
                                                        </th>
                                                    )
                                                ))}
                                                <th className="p-4 font-semibold text-gray-600 sticky right-0 bg-gray-50 drop-shadow-sm">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {sortedAndFilteredWorks.map((work) => (
                                                <tr key={work.id} className="hover:bg-blue-50/30 transition-colors group">
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
                                            {sortedAndFilteredWorks.length === 0 && (
                                                <tr>
                                                    <td colSpan="6" className="p-8 text-center text-gray-500">
                                                        No works found matching your criteria.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <WorkDetailDrawer
                work={selectedWork}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
            />
        </div>
    );
};

export default AdminDashboard;
