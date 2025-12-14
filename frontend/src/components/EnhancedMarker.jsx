import React from 'react';
import { DivIcon } from 'leaflet';
import { Marker, Popup, useMap } from 'react-leaflet';
import { MapPin, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

// "Kulla" colors for Departments
const DEPT_COLORS = {
    'RD (Rural Development)': '#EF4444', // Red
    'Education': '#3B82F6', // Blue
    'Health': '#10B981', // Emerald
    'Tribal Welfare': '#F59E0B', // Amber
    'PHE (Public Health Engineering)': '#6366F1', // Indigo
    'Forest': '#059669', // Green
    'Agriculture': '#84CC16', // Lime
    'default': '#6B7280' // Gray
};

const getStatusIcon = (status) => {
    switch (status) {
        case 'Completed': return <CheckCircle size={16} fill="white" className="text-green-600" />;
        case 'In Progress': return <Clock size={16} fill="white" className="text-yellow-600" />;
        default: return <AlertCircle size={16} fill="white" className="text-red-500" />;
    }
};

const createCustomIcon = (work) => {
    const color = DEPT_COLORS[work.department] || DEPT_COLORS['default'];

    // Create HTML for marker
    const iconMarkup = renderToStaticMarkup(
        <div className="relative group">
            <div className="transform transition-transform hover:scale-110" style={{ color: color }}>
                <MapPin size={40} fill={color} stroke="white" strokeWidth={1.5} />
            </div>
            {/* Status Badge */}
            <div className="absolute -top-1 -right-1 rounded-full shadow-md bg-white p-0.5">
                {getStatusIcon(work.current_status)}
            </div>
        </div>
    );

    return new DivIcon({
        html: iconMarkup,
        className: 'custom-marker', // Clean class, logic in HTML
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
    });
};

const EnhancedMarker = ({ work, onSelect }) => {
    return (
        <Marker
            position={[work.latitude, work.longitude]}
            icon={createCustomIcon(work)}
            eventHandlers={{
                click: () => onSelect(work)
            }}
        >
        </Marker>
    );
};

export default EnhancedMarker;
