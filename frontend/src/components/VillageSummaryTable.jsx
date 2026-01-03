import React, { useMemo, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';

const VillageSummaryTable = ({ data }) => {
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    // Group data by Block
    const groupedData = useMemo(() => {
        if (!data) return {};

        // Grouping
        const groups = data.reduce((acc, item) => {
            const block = item.block || 'Unknown';
            if (!acc[block]) acc[block] = [];
            acc[block].push(item);
            return acc;
        }, {});

        // Sorting within groups
        if (sortConfig.key) {
            Object.keys(groups).forEach(block => {
                groups[block].sort((a, b) => {
                    const valA = a[sortConfig.key];
                    const valB = b[sortConfig.key];

                    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                });
            });
        }

        return groups;
    }, [data, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const renderSortIcon = (key) => {
        if (sortConfig.key !== key) return <ArrowUpDown size={12} className="text-gray-400 opacity-50" />;
        return <ArrowUpDown size={12} className={sortConfig.direction === 'asc' ? 'text-blue-600' : 'text-blue-600 rotate-180'} />;
    };

    const headers = [
        { key: 'panchayat', label: 'Panchayat Name', align: 'left' },
        { key: 'total_works', label: 'Total Works', align: 'center' },
        { key: 'total_amount', label: 'Total Amt (L)', align: 'right' },
        { key: 'completed_works', label: 'Completed (No)', align: 'center' },
        { key: 'completed_amount', label: 'Completed (Amt)', align: 'right' },
        { key: 'progress_works', label: 'In Progress (No)', align: 'center' },
        { key: 'progress_amount', label: 'In Progress (Amt)', align: 'right' },
    ];

    if (!data || data.length === 0) {
        return <div className="p-8 text-center text-gray-500">No summary data available.</div>;
    }

    return (
        <div className="h-full overflow-auto bg-gray-50 p-4">
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            {headers.map((h) => (
                                <th
                                    key={h.key}
                                    className={`p-4 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors select-none text-${h.align}`}
                                    onClick={() => handleSort(h.key)}
                                >
                                    <div className={`flex items-center gap-1 ${h.align === 'right' ? 'justify-end' : h.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                                        {h.label}
                                        {renderSortIcon(h.key)}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {Object.keys(groupedData).sort().map(blockName => (
                            <React.Fragment key={blockName}>
                                {/* Block Header Row */}
                                <tr className="bg-blue-50 border-t border-b border-blue-100">
                                    <td colSpan={headers.length} className="p-3 font-bold text-blue-800 text-sm">
                                        BLOCK: {blockName.toUpperCase()}
                                    </td>
                                </tr>
                                {/* Village Rows */}
                                {groupedData[blockName].map((row, idx) => (
                                    <tr key={`${blockName}-${row.panchayat}-${idx}`} className="hover:bg-gray-50 transition-colors group">
                                        <td className="p-3 pl-6 font-medium text-gray-900 border-l-4 border-transparent group-hover:border-blue-400">
                                            {row.panchayat}
                                        </td>
                                        <td className="p-3 text-center text-gray-700">{row.total_works}</td>
                                        <td className="p-3 text-right font-medium text-gray-900">{row.total_amount?.toFixed(2)}</td>

                                        <td className="p-3 text-center text-green-700 bg-green-50/30">{row.completed_works}</td>
                                        <td className="p-3 text-right text-green-700 font-medium bg-green-50/30">{row.completed_amount?.toFixed(2)}</td>

                                        <td className="p-3 text-center text-blue-700 bg-blue-50/30">{row.progress_works}</td>
                                        <td className="p-3 text-right text-blue-700 font-medium bg-blue-50/30">{row.progress_amount?.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default VillageSummaryTable;
