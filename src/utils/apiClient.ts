import api from './api';

export interface BulkDeleteResult {
  success: boolean;
  deleted: number;
}

export const deviceKeysApi = {
  deleteMany: async (ids: number[]): Promise<BulkDeleteResult> => {
    const res = await api.delete('/device-keys', { data: { ids } });
    return res.data;
  },
};

export const savesApi = {
  deleteMany: async (ids: number[]): Promise<BulkDeleteResult> => {
    const res = await api.delete('/saves', { data: { ids } });
    return res.data;
  },
};
