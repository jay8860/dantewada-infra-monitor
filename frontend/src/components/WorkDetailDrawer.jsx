import React, { useEffect, useState } from 'react';
import { X, Calendar, MapPin, IndianRupee, Image as ImageIcon, History, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import api from '../api';

const WorkDetailDrawer = ({ work, isOpen, onClose }) => {
    const [timeline, setTimeline] = useState([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);

    useEffect(() => {
        if (work && isOpen) {
            fetchTimeline();
        } else {
            setTimeline([]);
        }
    }, [work, isOpen]);

    const fetchTimeline = async () => {
        setLoadingTimeline(true);
        try {
            const res = await api.get(`/works/${work.id}/timeline`);
            setTimeline(res.data);
        } catch (err) {
            console.error("Failed to fetch timeline", err);
        } finally {
            setLoadingTimeline(false);
        }
    };

    const getWorkImage = (name) => {
        const n = (name || '').toLowerCase();
        if (n.includes('road') || n.includes('bt') || n.includes('cc')) return 'https://images.unsplash.com/photo-1545938506-6c2e39c4a8f9?auto=format&fit=crop&w=800&q=80';
        if (n.includes('building') || n.includes('school') || n.includes('anganwadi') || n.includes('bhavan') || n.includes('hostel')) return 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80';
        if (n.includes('pond') || n.includes('tank') || n.includes('water') || n.includes('canal') || n.includes('dabri')) return 'https://images.unsplash.com/photo-1519965173775-f93504116496?auto=format&fit=crop&w=800&q=80';
        if (n.includes('bridge') || n.includes('culvert')) return 'https://images.unsplash.com/photo-1512401815136-11f81498b584?auto=format&fit=crop&w=800&q=80';
        return 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80'; // Default Construction
    };

    if (!work) return null;

    return (
        <div className={`fixed inset-y-0 right-0 z-[1000] w-full md:w-[480px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

            {/* Lively Header Image */}
            <div className="h-40 w-full relative shrink-0">
                <img
                    src={getWorkImage(work.work_name)}
                    alt="Work Category"
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-blue-900/90 to-transparent"></div>
                <button onClick={onClose} className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white p-1 rounded-full backdrop-blur-sm transition">
                    <X size={20} />
                </button>
            </div>

            {/* Header Text */}
            <div className="bg-blue-900 text-white px-6 pb-6 pt-2 shrink-0 relative z-10 -mt-2">
                <div>
                    <h2 className="text-xl font-bold leading-tight shadow-black drop-shadow-md">{work.work_name}</h2>
                    <p className="text-blue-200 text-sm mt-1 flex items-center gap-2">
                        <span className="bg-blue-800 px-2 py-0.5 rounded text-xs border border-blue-700">{work.work_code}</span>
                    </p>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {/* Status Badge */}
                <div className="mb-6 flex justify-between items-center">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wide ${work.current_status === 'Completed' ? 'bg-green-100 text-green-800' :
                        work.current_status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                        }`}>
                        {work.current_status}
                    </span>
                    <span className="text-xs text-gray-500">
                        Last Updated: {new Date(work.last_updated).toLocaleDateString()}
                    </span>
                </div>

                {/* Tabs or Sections? Sticking to vertical scroll for now */}

                {/* Timeline Section */}
                <div className="mb-8">
                    <h4 className="text-sm font-bold text-gray-800 uppercase mb-4 flex items-center gap-2">
                        <History size={16} /> Inspection History
                    </h4>

                    {loadingTimeline ? (
                        <p className="text-sm text-gray-400">Loading history...</p>
                    ) : timeline.length === 0 ? (
                        <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500 text-sm italic">
                            No inspections recorded yet.
                        </div>
                    ) : (
                        <div className="relative border-l-2 border-gray-200 ml-3 space-y-8">
                            {timeline.map((event, idx) => (
                                <div key={event.id} className="ml-6 relative">
                                    <span className="absolute -left-[31px] top-0 bg-white border-2 border-blue-500 rounded-full w-4 h-4"></span>

                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{new Date(event.date).toLocaleDateString()}</p>
                                            <p className="text-xs text-gray-500">{new Date(event.date).toLocaleTimeString()}</p>
                                        </div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${event.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {event.status}
                                        </span>
                                    </div>

                                    <p className="text-xs text-gray-600 mt-1">
                                        <span className="font-semibold">Inspector:</span> {event.inspector}
                                    </p>
                                    {event.remarks && (
                                        <p className="text-sm text-gray-700 mt-2 bg-gray-50 p-2 rounded border border-gray-100">
                                            "{event.remarks}"
                                        </p>
                                    )}

                                    {/* Event Photos */}
                                    {event.photos && event.photos.length > 0 && (
                                        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                                            {event.photos.map((photo, pIdx) => (
                                                <img
                                                    key={pIdx}
                                                    src={`http://localhost:8000/${photo.url}`}
                                                    alt="Inspection"
                                                    className="w-20 h-20 object-cover rounded border hover:scale-105 transition-transform"
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <hr className="my-6 border-gray-100" />

                {/* Details Grid */}
                <div className="space-y-6">
                    {/* Basic Info */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Basic Info</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-gray-400">Unique ID</p>
                                <p className="text-sm font-medium">{work.unique_id || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Brief Name</p>
                                <p className="text-sm font-medium">{work.work_name_brief || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Panchayat / Block</p>
                                <p className="text-sm font-medium">{work.panchayat}, {work.block}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Financial Year</p>
                                <p className="text-sm font-medium">{work.financial_year}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Verified?</p>
                                <p className="text-sm font-medium">{work.verified_on_ground || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Physical Progress</p>
                                <p className="text-sm font-medium">{work.work_percentage || '-'}</p>
                            </div>
                        </div>
                        {work.csv_photo_info && (
                            <p className="text-xs text-gray-500 mt-2 bg-yellow-50 p-2 rounded border border-yellow-100">
                                <span className="font-semibold">Imported Photo Data:</span> {work.csv_photo_info}
                            </p>
                        )}
                    </div>

                    <hr className="border-dashed" />

                    {/* Financials */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Financials</h4>
                        <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border">
                            <div>
                                <p className="text-xs text-gray-400">AS Amount</p>
                                <p className="text-sm font-bold text-blue-900">₹{work.sanctioned_amount?.toLocaleString()} Lakhs</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Evaluation Amt</p>
                                <p className="text-sm font-bold text-gray-700">₹{work.evaluation_amount?.toLocaleString() || '-'} Lakhs</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Total Released</p>
                                <p className="text-sm font-bold text-green-700">₹{work.total_released_amount?.toLocaleString() || '-'} Lakhs</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Pending Amt</p>
                                <p className="text-sm font-bold text-red-700">₹{work.amount_pending?.toLocaleString() || '-'} Lakhs</p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 italic">Released Details: {work.agency_release_details || 'N/A'}</p>
                    </div>

                    <hr className="border-dashed" />

                    {/* Agency & Dates */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Agency & Execution</h4>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-500">Agency Name</span>
                                <span className="text-sm font-medium text-right">{work.agency_name || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-500">AS Number</span>
                                <span className="text-sm font-medium text-right">{work.as_number || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-500">AS Date</span>
                                <span className="text-sm font-medium text-right">{work.sanctioned_date ? new Date(work.sanctioned_date).toLocaleDateString() : '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-500">Tender Date</span>
                                <span className="text-sm font-medium text-right">{work.tender_date ? new Date(work.tender_date).toLocaleDateString() : '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-500">Probable Completion</span>
                                <span className="text-sm font-medium text-right">{work.probable_completion_date ? new Date(work.probable_completion_date).toLocaleDateString() : '-'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <hr className="my-6 border-gray-100" />

                {/* Photos */}
                <div>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                        <ImageIcon size={18} /> Site Photos
                    </h3>

                    <div className="grid grid-cols-2 gap-2">
                        {work.photos && work.photos.length > 0 ? (
                            work.photos.map((photo, idx) => (
                                <div key={photo.id} className="relative group rounded-lg overflow-hidden border">
                                    <img
                                        src={`http://localhost:8000/${photo.image_path}`}
                                        alt={`Site Photo ${idx + 1}`}
                                        className="w-full h-32 object-cover transition-transform group-hover:scale-105"
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 truncate">
                                        {new Date(photo.timestamp).toLocaleDateString()}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-2 text-center py-8 bg-gray-50 rounded border border-dashed text-gray-400 text-sm">
                                No photos uploaded yet
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkDetailDrawer;
