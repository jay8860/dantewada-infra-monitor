import React, { useEffect, useState } from 'react';
import { X, Calendar, MapPin, IndianRupee, Image as ImageIcon, History, CheckCircle, Clock, AlertCircle, Camera, Upload, Trash2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import PhotoLightbox from './PhotoLightbox';
import PhotoUploadModal from './PhotoUploadModal';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace('/api', '');

const PHOTO_CATEGORIES = ['All', 'Before', 'During', 'After', 'Completed'];

const WorkDetailDrawer = ({ work, isOpen, onClose, hideUpload = false }) => {
    const { user } = useAuth();
    const [timeline, setTimeline] = useState([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);
    const [fullWork, setFullWork] = useState(null);

    // Photo state
    const [photos, setPhotos] = useState([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);
    const [activeCategory, setActiveCategory] = useState('All');
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);

    useEffect(() => {
        if (work && isOpen) {
            setFullWork(work);
            fetchFullDetails();
            fetchTimeline();
            fetchPhotos();
        } else {
            setTimeline([]);
            setFullWork(null);
            setPhotos([]);
            setActiveCategory('All');
        }
    }, [work, isOpen]);

    const fetchFullDetails = async () => {
        try {
            const res = await api.get(`/works/${work.id}`);
            setFullWork(res.data);
        } catch (err) {
            console.error("Failed to fetch full work details", err);
        }
    };

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

    const fetchPhotos = async (category) => {
        setLoadingPhotos(true);
        try {
            const params = {};
            if (category && category !== 'All') {
                params.category = category;
            }
            const res = await api.get(`/works/${work.id}/photos`, { params });
            setPhotos(res.data);
        } catch (err) {
            console.error("Failed to fetch photos", err);
        } finally {
            setLoadingPhotos(false);
        }
    };

    const handleCategoryChange = (cat) => {
        setActiveCategory(cat);
        fetchPhotos(cat);
    };

    const handlePhotoClick = (index) => {
        setLightboxIndex(index);
        setLightboxOpen(true);
    };

    const handleUploadComplete = () => {
        fetchPhotos(activeCategory);
    };

    const handleDeletePhoto = async (photoId) => {
        if (!confirm('Delete this photo?')) return;
        try {
            await api.delete(`/works/${work.id}/photos/${photoId}`);
            fetchPhotos(activeCategory);
        } catch (err) {
            console.error("Failed to delete photo", err);
        }
    };

    const getWorkImage = (name) => {
        const n = (name || '').toLowerCase();
        if (n.includes('road') || n.includes('bt') || n.includes('cc')) return 'https://images.unsplash.com/photo-1545938506-6c2e39c4a8f9?auto=format&fit=crop&w=800&q=80';
        if (n.includes('building') || n.includes('school') || n.includes('anganwadi') || n.includes('bhavan') || n.includes('hostel')) return 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80';
        if (n.includes('pond') || n.includes('tank') || n.includes('water') || n.includes('canal') || n.includes('dabri')) return 'https://images.unsplash.com/photo-1519965173775-f93504116496?auto=format&fit=crop&w=800&q=80';
        if (n.includes('bridge') || n.includes('culvert')) return 'https://images.unsplash.com/photo-1512401815136-11f81498b584?auto=format&fit=crop&w=800&q=80';
        return 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80';
    };

    const displayWork = fullWork || work;

    if (!displayWork) return null;

    const isLoggedIn = !!user;
    const isAdmin = user?.role === 'admin';

    return (
        <>
            <div className={`fixed inset-y-0 right-0 z-[1000] w-full md:w-[480px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

                {/* Header Image */}
                <div className="h-40 w-full relative shrink-0">
                    <img
                        src={getWorkImage(displayWork.work_name)}
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
                        <h2 className="text-xl font-bold leading-tight shadow-black drop-shadow-md">{displayWork.work_name}</h2>
                        <p className="text-blue-200 text-sm mt-1 flex items-center gap-2">
                            <span className="bg-blue-800 px-2 py-0.5 rounded text-xs border border-blue-700">{displayWork.work_code}</span>
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Status Badge */}
                    <div className="mb-6 flex justify-between items-center">
                        <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wide ${displayWork.current_status === 'Completed' ? 'bg-green-100 text-green-800' :
                            displayWork.current_status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                            }`}>
                            {displayWork.current_status}
                        </span>
                        <span className="text-xs text-gray-500">
                            Last Updated: {new Date(displayWork.last_updated + 'Z').toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                    </div>

                    {/* ========== SITE PHOTOS SECTION ========== */}
                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold text-gray-800 uppercase flex items-center gap-2">
                                <Camera size={16} /> Site Photos
                                {photos.length > 0 && (
                                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                        {photos.length}
                                    </span>
                                )}
                            </h4>
                            {isLoggedIn && !hideUpload && (
                                <button
                                    onClick={() => setUploadModalOpen(true)}
                                    className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm hover:shadow-md"
                                >
                                    <Upload size={12} /> Upload
                                </button>
                            )}
                        </div>

                        {/* Category Tabs */}
                        <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
                            {PHOTO_CATEGORIES.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => handleCategoryChange(cat)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                                        activeCategory === cat
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        {/* Photo Grid */}
                        {loadingPhotos ? (
                            <div className="flex justify-center py-8">
                                <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                            </div>
                        ) : photos.length === 0 ? (
                            <div className="p-6 bg-gray-50 rounded-xl text-center text-gray-400 text-sm border border-dashed border-gray-200">
                                <Camera className="mx-auto mb-2 text-gray-300" size={32} />
                                No photos uploaded yet
                                {isLoggedIn && (
                                    <p className="text-xs mt-1 text-gray-400">Click "Upload" to add photos</p>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-2">
                                {photos.map((photo, idx) => (
                                    <div
                                        key={photo.id}
                                        className="relative group rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:border-blue-400 transition-all hover:shadow-md"
                                        onClick={() => handlePhotoClick(idx)}
                                    >
                                        <img
                                            src={`${API_BASE}/${photo.thumbnail_path}`}
                                            alt={photo.caption || `Photo ${idx + 1}`}
                                            className="w-full h-24 object-cover transition-transform group-hover:scale-105"
                                            loading="lazy"
                                        />
                                        {/* Category badge */}
                                        <div className="absolute top-1 left-1">
                                            <span className="bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                                                {photo.category}
                                            </span>
                                        </div>
                                        {/* Delete button (admin only) */}
                                        {isAdmin && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id); }}
                                                className="absolute top-1 right-1 bg-red-500/80 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        )}
                                        {/* Date */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                                            <p className="text-white text-[9px] truncate">
                                                {photo.uploaded_at ? new Date(photo.uploaded_at + 'Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <hr className="my-6 border-gray-100" />

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
                                                <p className="font-bold text-gray-800 text-sm">{new Date(event.date + 'Z').toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                                                <p className="text-xs text-gray-500">{new Date(event.date + 'Z').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
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
                                                        src={`${API_BASE}/${photo.url}`}
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
                    <div className="space-y-8">
                        {/* Basic Context */}
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Work Identity</p>
                            <p className="text-lg font-medium font-hindi text-blue-900 leading-snug mb-1">
                                {displayWork.work_name_brief || displayWork.work_name}
                            </p>
                            <p className="text-sm text-gray-600">
                                {displayWork.panchayat}, {displayWork.block}
                            </p>
                        </div>

                        {/* Agency & Execution */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b pb-1">Agency & Execution</h4>
                            <div className="grid grid-cols-1 gap-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">Agency Name</span>
                                    <span className="text-sm font-medium text-right max-w-[60%] truncate" title={displayWork.agency_name}>{displayWork.agency_name || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">AS Number</span>
                                    <span className="text-sm font-medium text-right">{displayWork.as_number}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">AS Date</span>
                                    <span className="text-sm font-medium text-right">{displayWork.sanctioned_date ? new Date(displayWork.sanctioned_date).toLocaleDateString() : '-'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">Sanctioned Amount</span>
                                    <span className="text-sm font-medium text-right">₹{displayWork.sanctioned_amount?.toLocaleString()} Lakhs</span>
                                </div>
                            </div>
                        </div>

                        {/* Financial Status */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b pb-1">Financial Status</h4>
                            <div className="grid grid-cols-1 gap-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">Total Released</span>
                                    <span className="text-sm font-medium text-right text-green-700">₹{displayWork.total_released_amount?.toLocaleString()} Lakhs</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">Pending Amount</span>
                                    <span className="text-sm font-medium text-right text-red-600">₹{displayWork.amount_pending?.toLocaleString()} Lakhs</span>
                                </div>
                            </div>
                        </div>

                        {/* Inspection & Progress */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b pb-1">Progress & Inspection</h4>
                            <div className="grid grid-cols-1 gap-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">Current Status</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${displayWork.current_status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {displayWork.current_status}
                                    </span>
                                </div>
                                <div className="flex justify-between items-start">
                                    <span className="text-sm text-gray-500 whitespace-nowrap mr-4">Remark</span>
                                    <span className="text-sm text-gray-700 text-right italic">{displayWork.remark || 'No remarks'}</span>
                                </div>
                                {displayWork.inspection_date && (
                                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed">
                                        <span className="text-sm text-gray-500">Last Inspection</span>
                                        <span className="text-sm font-medium text-right">{new Date(displayWork.inspection_date).toLocaleDateString()}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div >
            </div >

            {/* Lightbox */}
            <PhotoLightbox
                photos={photos}
                currentIndex={lightboxIndex}
                isOpen={lightboxOpen}
                onClose={() => setLightboxOpen(false)}
                onNavigate={(idx) => setLightboxIndex(idx)}
            />

            {/* Upload Modal */}
            <PhotoUploadModal
                workId={work?.id}
                workName={displayWork?.work_name}
                isOpen={uploadModalOpen}
                onClose={() => setUploadModalOpen(false)}
                onUploadComplete={handleUploadComplete}
            />
        </>
    );
};

export default WorkDetailDrawer;
