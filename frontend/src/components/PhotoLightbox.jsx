import React, { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download, User, Calendar } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace('/api', '');

/**
 * Full-screen lightbox for viewing photos at full resolution.
 * Supports keyboard navigation (arrows, ESC), swipe-like prev/next.
 */
const PhotoLightbox = ({ photos, currentIndex, isOpen, onClose, onNavigate }) => {
    const handleKeyDown = useCallback((e) => {
        if (!isOpen) return;
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowRight') onNavigate(Math.min(currentIndex + 1, photos.length - 1));
        if (e.key === 'ArrowLeft') onNavigate(Math.max(currentIndex - 1, 0));
    }, [isOpen, currentIndex, photos.length, onClose, onNavigate]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Prevent body scroll when lightbox is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    if (!isOpen || !photos || photos.length === 0) return null;

    const photo = photos[currentIndex];
    if (!photo) return null;

    const imageUrl = `${API_BASE}/${photo.image_path}`;

    return (
        <div
            className="fixed inset-0 z-[2000] bg-black/95 flex items-center justify-center"
            onClick={onClose}
        >
            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-sm transition-all"
            >
                <X size={24} />
            </button>

            {/* Counter */}
            <div className="absolute top-4 left-4 z-10 text-white/70 text-sm font-medium bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                {currentIndex + 1} / {photos.length}
            </div>

            {/* Previous Arrow */}
            {currentIndex > 0 && (
                <button
                    onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1); }}
                    className="absolute left-2 md:left-6 z-10 bg-white/10 hover:bg-white/25 text-white p-2 md:p-3 rounded-full backdrop-blur-sm transition-all"
                >
                    <ChevronLeft size={28} />
                </button>
            )}

            {/* Next Arrow */}
            {currentIndex < photos.length - 1 && (
                <button
                    onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1); }}
                    className="absolute right-2 md:right-6 z-10 bg-white/10 hover:bg-white/25 text-white p-2 md:p-3 rounded-full backdrop-blur-sm transition-all"
                >
                    <ChevronRight size={28} />
                </button>
            )}

            {/* Main Image */}
            <div
                className="max-w-[90vw] max-h-[80vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={imageUrl}
                    alt={photo.caption || `Photo ${currentIndex + 1}`}
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl select-none"
                    draggable={false}
                />
            </div>

            {/* Bottom Info Bar */}
            <div
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-16"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="max-w-3xl mx-auto">
                    {/* Caption */}
                    {photo.caption && (
                        <p className="text-white text-base mb-2">{photo.caption}</p>
                    )}
                    
                    {/* Meta */}
                    <div className="flex items-center gap-4 text-white/60 text-xs">
                        {photo.category && (
                            <span className="bg-white/10 px-2 py-1 rounded-full">
                                {photo.category}
                            </span>
                        )}
                        {photo.uploaded_by && (
                            <span className="flex items-center gap-1">
                                <User size={12} /> {photo.uploaded_by}
                            </span>
                        )}
                        {photo.uploaded_at && (
                            <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                {new Date(photo.uploaded_at).toLocaleDateString('en-IN', {
                                    day: '2-digit', month: 'short', year: 'numeric'
                                })}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PhotoLightbox;
