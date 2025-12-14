import { openDB } from 'idb';

const DB_NAME = 'dantewada_offline_db';
const STORE_NAME = 'pending_uploads';

const dbPromise = openDB(DB_NAME, 1, {
    upgrade(db) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    },
});

export const saveOfflineUpdate = async (updateData) => {
    const db = await dbPromise;
    // stored data: { workId, status, latitude, longitude, photoBlob, timestamp }
    return db.put(STORE_NAME, updateData);
};

export const getPendingUpdates = async () => {
    const db = await dbPromise;
    return db.getAll(STORE_NAME);
};

export const deletePendingUpdate = async (id) => {
    const db = await dbPromise;
    return db.delete(STORE_NAME, id);
};

export const clearAllUpdates = async () => {
    const db = await dbPromise;
    return db.clear(STORE_NAME);
};
