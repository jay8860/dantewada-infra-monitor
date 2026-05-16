const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const getConfiguredApiOrigin = () => {
    const configuredApi = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
    if (!configuredApi || configuredApi === '/api') {
        return '';
    }

    return trimTrailingSlash(configuredApi.replace(/\/api\/?$/, ''));
};

const getDefaultMediaOrigin = () => {
    const configuredOrigin = getConfiguredApiOrigin();
    if (configuredOrigin) {
        return configuredOrigin;
    }

    const host = window.location.hostname;
    const isLocalVite = (host === 'localhost' || host === '127.0.0.1') && window.location.port !== '8000';
    return isLocalVite ? 'http://localhost:8000' : '';
};

const normalizeMediaPath = (path) => {
    const normalized = String(path).replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/').filter(Boolean);
    const uploadIndex = parts.indexOf('uploads');

    if (uploadIndex >= 0 && uploadIndex < parts.length - 1) {
        return parts.slice(uploadIndex).join('/');
    }

    return normalized;
};

export const buildMediaUrl = (path) => {
    if (!path) {
        return '';
    }

    const value = String(path);
    if (/^(https?:|data:|blob:)/i.test(value)) {
        return value;
    }

    const normalizedPath = normalizeMediaPath(value);
    const origin = getDefaultMediaOrigin();
    return origin ? `${origin}/${normalizedPath}` : `/${normalizedPath}`;
};
