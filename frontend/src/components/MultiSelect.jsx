import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

const MultiSelect = ({
    options,
    value = [],
    onChange,
    placeholder = "Select...",
    label,
    showSearch = true
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);

    // Filter options based on search
    const filteredOptions = options.filter(opt =>
        String(opt).toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Handle clicking outside to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option) => {
        const newValue = value.includes(option)
            ? value.filter(v => v !== option)
            : [...value, option];
        onChange(newValue);
    };

    const handleSelectAll = () => {
        if (value.length === filteredOptions.length) {
            onChange([]);
        } else {
            onChange(filteredOptions);
        }
    };

    const isAllSelected = filteredOptions.length > 0 && value.length === filteredOptions.length;

    return (
        <div className="relative min-w-[160px]" ref={dropdownRef}>
            {label && <label className="block text-xs font-semibold text-gray-500 mb-1 ml-1">{label}</label>}

            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-white border rounded-lg px-3 py-2 text-sm text-left flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-gray-50 transition"
            >
                <div className="flex gap-1 flex-wrap truncate mr-2">
                    {value.length === 0 ? (
                        <span className="text-gray-400">{placeholder}</span>
                    ) : (
                        <span className="text-gray-900 font-medium">
                            {value.length === 1 ? value[0] : `${value.length} Selected`}
                        </span>
                    )}
                </div>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl z-50 overflow-hidden flex flex-col max-h-64 animate-in fade-in zoom-in-95 duration-100">

                    {/* Search Bar */}
                    {showSearch && (
                        <div className="p-2 border-b bg-gray-50">
                            <div className="relative">
                                <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search..."
                                    className="w-full pl-8 pr-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}

                    {/* Actions Row */}
                    <div className="flex justify-between items-center px-3 py-2 border-b bg-gray-50 text-xs">
                        <button
                            onClick={handleSelectAll}
                            className="text-blue-600 font-semibold hover:text-blue-800"
                        >
                            {isAllSelected ? "Deselect All" : "Select All"}
                        </button>
                        <span className="text-gray-400">{filteredOptions.length} options</span>
                    </div>

                    {/* Options List */}
                    <div className="overflow-y-auto p-1 flex-1">
                        {filteredOptions.length === 0 ? (
                            <div className="p-3 text-center text-xs text-gray-400">No options found</div>
                        ) : (
                            filteredOptions.map((opt) => {
                                const isSelected = value.includes(opt);
                                return (
                                    <label
                                        key={opt}
                                        className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition text-sm ${isSelected ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50 text-gray-700'}`}
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
                                            {isSelected && <Check size={10} className="text-white" />}
                                        </div>
                                        <span className="truncate">{opt}</span>
                                    </label>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MultiSelect;
