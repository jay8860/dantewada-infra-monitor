import React, { useState, useEffect } from 'react';
import { X, User, Shield, MapPin, Eye, EyeOff, Key, Building2 } from 'lucide-react';
import api from '../api';
import MultiSelect from './MultiSelect';

const ROLES = ['admin', 'officer'];

/**
 * Modal to create or edit a user with role, department, agency, and access scoping.
 * Uses pre-filled MultiSelect dropdowns for blocks, panchayats, and agencies.
 */
const UserManagementModal = ({ user, isOpen, onClose, onSave, filterOptions }) => {
    const isEdit = !!user;

    const [form, setForm] = useState({
        username: '',
        password: '',
        role: 'officer',
        department: '',
        allowed_blocks: [],
        allowed_panchayats: [],
        allowed_agencies: [],
        is_active: true
    });
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Convert comma-separated string to array
    const csvToArray = (val) => {
        if (!val) return [];
        return val.split(',').map(s => s.trim()).filter(Boolean);
    };

    // Convert array to comma-separated string
    const arrayToCsv = (arr) => {
        if (!arr || arr.length === 0) return null;
        return arr.join(', ');
    };

    useEffect(() => {
        if (user) {
            setForm({
                username: user.username || '',
                password: '',
                role: user.role || 'officer',
                department: user.department || '',
                allowed_blocks: csvToArray(user.allowed_blocks),
                allowed_panchayats: csvToArray(user.allowed_panchayats),
                allowed_agencies: csvToArray(user.allowed_agencies),
                is_active: user.is_active !== false
            });
        } else {
            setForm({
                username: '',
                password: '',
                role: 'officer',
                department: '',
                allowed_blocks: [],
                allowed_panchayats: [],
                allowed_agencies: [],
                is_active: true
            });
        }
        setError('');
    }, [user, isOpen]);

    const handleSave = async () => {
        if (!form.username.trim()) {
            setError('Username is required');
            return;
        }
        if (!isEdit && !form.password) {
            setError('Password is required for new users');
            return;
        }

        setSaving(true);
        setError('');

        try {
            if (isEdit) {
                const payload = {
                    role: form.role,
                    department: form.department || null,
                    allowed_blocks: arrayToCsv(form.allowed_blocks),
                    allowed_panchayats: arrayToCsv(form.allowed_panchayats),
                    allowed_agencies: arrayToCsv(form.allowed_agencies),
                    is_active: form.is_active
                };
                if (form.password) {
                    payload.new_password = form.password;
                }
                await api.put(`/users/${user.id}`, payload);
            } else {
                await api.post('/users', {
                    username: form.username,
                    password: form.password,
                    role: form.role,
                    department: form.department || null,
                    allowed_blocks: arrayToCsv(form.allowed_blocks),
                    allowed_panchayats: arrayToCsv(form.allowed_panchayats),
                    allowed_agencies: arrayToCsv(form.allowed_agencies)
                });
            }
            onSave?.();
            onClose();
        } catch (err) {
            console.error('Save failed:', err);
            setError(err.response?.data?.detail || 'Failed to save user');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1500] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 flex items-center justify-between shrink-0">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <User size={20} /> {isEdit ? 'Edit User' : 'Create New User'}
                    </h3>
                    <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Username */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Username</label>
                        <input
                            type="text"
                            value={form.username}
                            onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                            disabled={isEdit}
                            placeholder="e.g., officer_health_01"
                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition ${isEdit ? 'bg-gray-100 text-gray-500' : ''}`}
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                            {isEdit ? 'New Password' : 'Password'}
                            {isEdit && <span className="text-gray-400 font-normal ml-1">(leave blank to keep current)</span>}
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={form.password}
                                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                                placeholder={isEdit ? 'Leave blank to keep unchanged' : 'Enter password'}
                                className="w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Role */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                            <Shield size={12} className="inline mr-1" />Role
                        </label>
                        <div className="flex gap-2">
                            {ROLES.map(r => (
                                <button
                                    key={r}
                                    onClick={() => setForm(p => ({ ...p, role: r }))}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 ${
                                        form.role === r
                                            ? r === 'admin'
                                                ? 'bg-red-600 text-white shadow-md'
                                                : 'bg-indigo-600 text-white shadow-md'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {r === 'admin' ? '🔑 Admin' : '👤 Officer'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Department */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Department</label>
                        <select
                            value={form.department}
                            onChange={e => setForm(p => ({ ...p, department: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
                        >
                            <option value="">All Departments (no restriction)</option>
                            {(filterOptions?.departments || []).map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>

                    {/* Access Scoping - Only for officers */}
                    {form.role === 'officer' && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-4">
                            <div>
                                <p className="text-xs font-bold text-blue-700 uppercase mb-1 flex items-center gap-1">
                                    <MapPin size={12} /> Access Scope
                                </p>
                                <p className="text-xs text-blue-600">
                                    Leave empty for full access. Select specific items to restrict.
                                </p>
                            </div>

                            {/* Access Type Info */}
                            <div className="bg-white p-2 rounded-lg border border-blue-200">
                                <p className="text-xs text-gray-600">
                                    <span className="font-bold text-indigo-600">Edit Access:</span> Officers can only upload <strong>photos</strong> and add <strong>remarks</strong>. They cannot modify work names, amounts, or other fields.
                                </p>
                            </div>

                            {/* Agency Dropdown */}
                            <div>
                                <label className="text-xs font-bold text-gray-600 block mb-1.5 flex items-center gap-1">
                                    <Building2 size={12} /> Allowed Agencies
                                </label>
                                <MultiSelect
                                    options={filterOptions?.agencies || []}
                                    value={form.allowed_agencies}
                                    onChange={(val) => setForm(p => ({ ...p, allowed_agencies: val }))}
                                    placeholder="All Agencies (no restriction)"
                                    showSearch={true}
                                />
                            </div>

                            {/* Block Dropdown */}
                            <div>
                                <label className="text-xs font-bold text-gray-600 block mb-1.5">Allowed Blocks</label>
                                <MultiSelect
                                    options={filterOptions?.blocks || []}
                                    value={form.allowed_blocks}
                                    onChange={(val) => setForm(p => ({ ...p, allowed_blocks: val }))}
                                    placeholder="All Blocks (no restriction)"
                                    showSearch={true}
                                />
                            </div>

                            {/* Panchayat Dropdown */}
                            <div>
                                <label className="text-xs font-bold text-gray-600 block mb-1.5">Allowed Panchayats</label>
                                <MultiSelect
                                    options={filterOptions?.panchayats || []}
                                    value={form.allowed_panchayats}
                                    onChange={(val) => setForm(p => ({ ...p, allowed_panchayats: val }))}
                                    placeholder="All Panchayats (no restriction)"
                                    showSearch={true}
                                />
                            </div>
                        </div>
                    )}

                    {/* Active Toggle (edit only) */}
                    {isEdit && (
                        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                            <div>
                                <p className="text-sm font-medium text-gray-700">Account Status</p>
                                <p className="text-xs text-gray-500">Deactivated users cannot login</p>
                            </div>
                            <button
                                onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                                className={`relative w-12 h-6 rounded-full transition-colors ${form.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                            >
                                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'left-6' : 'left-0.5'}`} />
                            </button>
                        </div>
                    )}

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
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`px-6 py-2 rounded-lg text-sm font-bold text-white transition-all ${
                            saving
                                ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-md hover:shadow-lg'
                        }`}
                    >
                        {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserManagementModal;
