import axios from 'axios';
import type {
  LoginResponse,
  User,
  Worker,
  Shift,
  Schedule,
  ShiftRequest,
  GenerateResponse,
  GAConfig,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
});

// Interceptor: tambahkan token ke setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor: handle 401 (token expired)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ===== Auth =====
export const authAPI = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const res = await api.post('/auth/login', { username, password });
    return res.data;
  },
  register: async (data: {
    username: string;
    password: string;
    fullName: string;
    role?: string;
    workerId?: number;
  }): Promise<LoginResponse> => {
    const res = await api.post('/auth/register', data);
    return res.data;
  },
  getMe: async (): Promise<User> => {
    const res = await api.get('/auth/me');
    return res.data;
  },
};

// ===== Workers =====
export const workersAPI = {
  getAll: async (): Promise<Worker[]> => {
    const res = await api.get('/workers');
    return res.data;
  },
  getById: async (id: number): Promise<Worker> => {
    const res = await api.get(`/workers/${id}`);
    return res.data;
  },
  create: async (data: {
    name: string;
    workerType: string;
    skillLevel: string;
  }): Promise<Worker> => {
    const res = await api.post('/workers', data);
    return res.data;
  },
  update: async (
    id: number,
    data: Partial<Worker>
  ): Promise<Worker> => {
    const res = await api.put(`/workers/${id}`, data);
    return res.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/workers/${id}`);
  },
};

// ===== Shifts =====
export const shiftsAPI = {
  getAll: async (): Promise<Shift[]> => {
    const res = await api.get('/shifts');
    return res.data;
  },
  update: async (id: number, data: Partial<Shift>): Promise<Shift> => {
    const res = await api.put(`/shifts/${id}`, data);
    return res.data;
  },
};

// ===== Schedules =====
export const schedulesAPI = {
  getAll: async (): Promise<Schedule[]> => {
    const res = await api.get('/schedules');
    return res.data;
  },
  getById: async (id: number): Promise<Schedule> => {
    const res = await api.get(`/schedules/${id}`);
    return res.data;
  },
  generate: async (
    month: number,
    year: number,
    gaConfig?: Partial<GAConfig>
  ): Promise<GenerateResponse> => {
    const res = await api.post('/schedules/generate', { month, year, gaConfig });
    return res.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/schedules/${id}`);
  },
  getWorkerSchedule: async (
    scheduleId: number,
    workerId: number
  ) => {
    const res = await api.get(`/schedules/${scheduleId}/worker/${workerId}`);
    return res.data;
  },
  selectSchedule: async (id: number): Promise<{ message: string; schedule: Schedule }> => {
    const res = await api.put(`/schedules/${id}/select`);
    return res.data;
  },
  getSelected: async (): Promise<Schedule> => {
    const res = await api.get('/schedules/selected/active');
    return res.data;
  },
  editAssignment: async (scheduleId: number, data: {
    workerId: number;
    dayOfMonth: number;
    shiftName: string;
  }) => {
    const res = await api.put(`/schedules/${scheduleId}/assignment`, data);
    return res.data;
  },
  getViolations: async (scheduleId: number) => {
    const res = await api.get(`/schedules/${scheduleId}/violations`);
    return res.data;
  },
};

// ===== Shift Requests =====
export const shiftRequestsAPI = {
  getAll: async (): Promise<ShiftRequest[]> => {
    const res = await api.get('/shift-requests');
    return res.data;
  },
  create: async (data: {
    workerId: number;
    date: string;
    dateEnd?: string;
    type: string;
    shiftPref?: string;
    reason?: string;
  }) => {
    const res = await api.post('/shift-requests', data);
    return res.data;
  },
  updateStatus: async (
    id: number,
    status: 'approved' | 'rejected',
    rejectionReason?: string
  ): Promise<ShiftRequest> => {
    const res = await api.put(`/shift-requests/${id}/status`, { status, rejectionReason });
    return res.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/shift-requests/${id}`);
  },
};

// ===== Benchmark Results =====
export const benchmarkAPI = {
  getResults: async () => {
    const res = await api.get('/benchmark/results');
    return res.data;
  },
};

export default api;
