import React, { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, Camera, Trash2 } from 'lucide-react';
import api from '../api';

const CATEGORIES = ['Before', 'During', 'After', 'Completed'];

/**
 * Modal for uploading photos to a work.
 * Supports drag-and-drop, file picker, preview, caption, and category selector.
 */
const PhotoUploadModal = ({ workId, workName, isOpen, onClose, onUploadComplete }) => {
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [category, setCategory] = useState('During');
    const [caption, setCaption] = useState('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const handleFiles = (newFiles) => {
        const imageFiles = Array.from(newFiles).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            setError('Please select image files only');
            return;
        }
        setError('');
        
        // Limit to 10 files at a time
        const limited = imageFiles.slice(0, 10);
        setFiles(prev => [...prev, ...limited]);
        
        // Generate previews
        limited.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                setPreviews(prev => [...prev, { name: file.name, url: e.target.result, size: file.size }]);
            };
            reader.readAsDataURL(file);
        });
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = () => setDragOver(false);

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (files.length === 0) {
            setError('Please select at least one photo');
            return;
        }

        setUploading(true);
        setError('');

        try {
            const formData = new FormData();
            files.forEach(file => formData.append('photos', file));
            formData.append('category', category);
            formData.append('caption', caption);

            const res = await api.post(`/works/${workId}/photos`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            // Reset and close
            setFiles([]);
            setPreviews([]);
            setCaption('');
            setCategory('During');
            onUploadComplete?.(res.data);
            onClose();
        } catch (err) {
            console.error('Upload failed:', err);
            setError(err.response?.data?.detail || 'Upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const resetAndClose = () => {
        setFiles([]);
        setPreviews([]);
        setCaption('');
        setCategory('During');
        setError('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1500] bg-black/60 flex items-center justify-center p-4" onClick={resetAndClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <Camera size={20} /> Upload Photos
                        </h3>
                        <p className="text-blue-100 text-xs mt-0.5 truncate max-w-[300px]">{workName}</p>
                    </div>
                    <button onClick={resetAndClose} className="hover:bg-white/20 p-1 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Drop Zone */}
                    <div
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                            dragOver
                                ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                                : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'
                        }`}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="mx-auto text-gray-400 mb-2" size={36} />
                        <p className="text-gray-600 text-sm font-medium">
                            Drag & drop photos here, or <span className="text-blue-600 underline">browse</span>
                        </p>
                        <p className="text-gray-400 text-xs mt-1">JPG, PNG — up to 10 photos at a time</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleFiles(e.target.files)}
                        />
                    </div>

                    {/* Previews */}
                    {previews.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase mb-2">
                                {previews.length} Photo{previews.length > 1 ? 's' : ''} Selected
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                                {previews.map((p, idx) => (
                                    <div key={idx} className="relative group rounded-lg overflow-hidden border">
                                        <img src={p.url} alt={p.name} className="w-full h-24 object-cover" />
                                        <button
                                            onClick={() => removeFile(idx)}
                                            className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 py-0.5 truncate">
                                            {(p.size / 1024 / 1024).toFixed(1)} MB
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Category Selector */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Category</label>
                        <div className="flex gap-2 flex-wrap">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setCategory(cat)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                        category === cat
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Caption */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-2">
                            Caption <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={caption}
                            onChange={e => setCaption(e.target.value)}
                            placeholder="e.g., Foundation work in progress..."
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t px-6 py-4 flex items-center justify-between gap-3 bg-gray-50 shrink-0">
                    <button
                        onClick={resetAndClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={uploading || files.length === 0}
                        className={`px-6 py-2 rounded-lg text-sm font-bold text-white transition-all ${
                            uploading || files.length === 0
                                ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg'
                        }`}
                    >
                        {uploading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Uploading...
                            </span>
                        ) : (
                            `Upload ${files.length > 0 ? `${files.length} Photo${files.length > 1 ? 's' : ''}` : ''}`
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PhotoUploadModal;
