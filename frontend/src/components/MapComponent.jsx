import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapPin, CheckCircle, Clock, AlertCircle, AlertTriangle, DollarSign } from 'lucide-react';
import WorkDetailDrawer from './WorkDetailDrawer';

// --- Color Logic ---
const COLORS = {
    GREEN: '#16A34A', // Completed
    YELLOW: '#CA8A04', // In Progress
    RED: '#DC2626',   // Not Started
    PINK: '#EC4899',  // Payment Stuck
    BLUE: '#2563EB',  // Default Cluster
    BROWN: '#78350F'  // Block Level Cluster
};

const getStatusColor = (work) => {
    const status = (work.current_status || '').toLowerCase();
    const remark = (work.remark || '').toLowerCase();
    const combined = status + ' ' + remark;

    // Pink: Payment Stuck
    if (combined.includes('cc not come') || combined.includes('payment not done') || combined.includes('payment stuck')) {
        return COLORS.PINK;
    }

    // Green: Completed
    if (status.includes('completed') || status.includes('complete') || status.includes('पूर्ण')) {
        return COLORS.GREEN;
    }

    // Yellow: In Progress
    if (status.includes('progress') || status.includes('running') || status.includes('ongoing') || status.includes('प्रगति')) {
        return COLORS.YELLOW;
    }

    // Default Red: Not Started
    return COLORS.RED;
};

const getStatusIconComponent = (color) => {
    if (color === COLORS.GREEN) return <CheckCircle size={16} fill="white" className="text-green-600" />;
    if (color === COLORS.YELLOW) return <Clock size={16} fill="white" className="text-yellow-600" />;
    if (color === COLORS.PINK) return <DollarSign size={16} fill="white" className="text-pink-600" />;
    return <AlertCircle size={16} fill="white" className="text-red-600" />;
};

const createCustomIcon = (work) => {
    const color = getStatusColor(work);

    // Icon Markup
    const iconMarkup = renderToStaticMarkup(
        <div className="relative group">
            <div className="transform transition-transform hover:scale-110" style={{ color: color }}>
                <MapPin size={40} fill={color} stroke="white" strokeWidth={1.5} />
            </div>
            {/* Badge */}
            <div className="absolute -top-1 -right-1 rounded-full shadow-md bg-white p-0.5">
                {getStatusIconComponent(color)}
            </div>
        </div>
    );

    return L.divIcon({
        html: iconMarkup,
        className: 'custom-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
    });
};

// --- Map Controller ---
const MapController = ({ works }) => {
    const map = useMap();
    useEffect(() => {
        if (works && works.length > 0) {
            const markers = works
                .filter(w => w.latitude && w.longitude)
                .map(w => [w.latitude, w.longitude]);
            if (markers.length > 0) {
                try {
                    map.fitBounds(markers, { padding: [50, 50], maxZoom: 12 });
                } catch (e) { }
            }
        }
    }, [works, map]);
    return null;
};

// --- Cluster Layer ---
const ClusterLayer = ({ works, onSelect }) => {
    const map = useMap();
    const [libLoaded, setLibLoaded] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.L = L;
            import('leaflet.markercluster').then(() => {
                setLibLoaded(true);
            }).catch(e => console.error("Failed to load markercluster", e));
        }
    }, []);

    useEffect(() => {
        if (!map || !works || !libLoaded) return;
        if (!L.markerClusterGroup) return;

        // Helper to create cluster icons
        const createClusterIcon = (cluster, type) => {
            const count = cluster.getChildCount();
            const color = type === 'BLOCK' ? COLORS.BROWN : COLORS.BLUE;

            // SVG Design (Teardrop with White Circle)
            const svgIcon = `
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 3px rgba(0,0,0,0.3));">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${color}" fill-opacity="1" />
                    <circle cx="12" cy="9" r="4.5" fill="white" fill-opacity="1" />
                </svg>
            `;

            const iconMarkup = `
                <div class="relative flex justify-center items-center w-full h-full">
                    <div style="width: 50px; height: 50px;">
                        ${svgIcon}
                    </div>
                    <span class="absolute text-black font-bold text-xs" style="top: 36%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;">${count}</span>
                </div>
            `;

            return L.divIcon({
                html: iconMarkup,
                className: 'custom-cluster-icon',
                iconSize: [50, 50],
                iconAnchor: [25, 50],
                popupAnchor: [0, -50]
            });
        };

        // Create Markers logic
        const createMarker = (work) => {
            const marker = L.marker([work.latitude, work.longitude], {
                icon: createCustomIcon(work),
            });
            marker.on('click', () => onSelect(work));
            return marker;
        };

        // 1. Block Level Group
        const blockGroup = L.markerClusterGroup({
            chunkedLoading: true,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            maxClusterRadius: 40,
            iconCreateFunction: (cluster) => createClusterIcon(cluster, 'BLOCK'),
            zoomToBoundsOnClick: true, // Auto zoom on click
        });

        // 2. GP Level Group
        const gpGroup = L.markerClusterGroup({
            chunkedLoading: true,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            maxClusterRadius: 40,
            iconCreateFunction: (cluster) => createClusterIcon(cluster, 'GP'),
            zoomToBoundsOnClick: true, // Auto zoom on click
        });

        const blockMarkers = [];
        const gpMarkers = [];

        works.forEach(work => {
            if (work.latitude && work.longitude) {
                // Determine type
                const isBlock = work.panchayat && (work.panchayat.includes('Block Level') || work.panchayat.includes('District Level'));
                const marker = createMarker(work);

                if (isBlock) {
                    blockMarkers.push(marker);
                } else {
                    gpMarkers.push(marker);
                }
            }
        });

        blockGroup.addLayers(blockMarkers);
        gpGroup.addLayers(gpMarkers);

        map.addLayer(blockGroup);
        map.addLayer(gpGroup);

        return () => {
            map.removeLayer(blockGroup);
            map.removeLayer(gpGroup);
        };
    }, [map, works, onSelect, libLoaded]);

    return null;
};

// --- Map Legend ---
const MapLegend = () => {
    return (
        <div className="leaflet-bottom leaflet-right m-4 z-[1000] pointer-events-auto">
            <div className="bg-white rounded-lg shadow-lg p-3 text-sm border border-gray-200">
                <h4 className="font-bold mb-2 text-gray-700">Map Legend</h4>

                <div className="space-y-2">
                    {/* Clusters */}
                    <div className="flex items-center gap-2">
                        <MapPin size={24} fill={COLORS.BROWN} stroke="white" strokeWidth={1.5} className="text-[#78350F]" />
                        <span>Block/District Level Cluster</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <MapPin size={24} fill={COLORS.BLUE} stroke="white" strokeWidth={1.5} className="text-[#2563EB]" />
                        <span>Gram Panchayat Cluster</span>
                    </div>

                    <div className="my-2 border-t border-gray-200"></div>

                    {/* Works */}
                    <div className="flex items-center gap-2">
                        <CheckCircle size={18} className="text-green-600 bg-white rounded-full" />
                        <span className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-green-600"></div>
                            Completed
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
                        <span>In Progress</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-600"></div>
                        <span>Not Started</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                        <span>Payment Stuck</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const MapComponent = ({ works }) => {
    const position = [18.9000, 81.3500];
    const [selectedWork, setSelectedWork] = useState(null);

    return (
        <div className="relative h-full w-full">
            <MapContainer center={position} zoom={10} scrollWheelZoom={true} className="h-full w-full rounded-lg z-0">
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
                />
                <MapController works={works} />
                <ClusterLayer works={works} onSelect={setSelectedWork} />

                {/* Legend Overlay */}
                <div className="absolute bottom-4 right-4 z-[1000]">
                    <MapLegend />
                </div>
            </MapContainer>

            <WorkDetailDrawer
                work={selectedWork}
                isOpen={!!selectedWork}
                onClose={() => setSelectedWork(null)}
            />
        </div>
    );
};

export default MapComponent;
