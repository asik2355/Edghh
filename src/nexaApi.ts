import axios from 'axios';
import { db_helper } from './database';

const DEFAULT_API_KEY = process.env.NEXA_API_KEY || 'nxa_9ad17cea99f85040fde8eb4fabdbff6f47f1e613';
const BASE_URL = process.env.NEXA_BASE_URL || 'http://2.58.82.137/api/v1';

const getApiClient = () => {
  const apiKey = db_helper.getSetting('nexa_api_key') || DEFAULT_API_KEY;
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });
};

export const nexaApi = {
  getBalance: async () => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.get('/balance');
      return response.data;
    } catch (error) {
      console.error('Error fetching balance:', error);
      return null;
    }
  },

  requestNumber: async (range: string) => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.post('/numbers/get', {
        range,
        format: 'normal'
      });
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      console.error('Error requesting number:', error.message);
      return { success: false, error: 'Connection error' };
    }
  },

  checkSms: async (numberId: string) => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.get(`/numbers/${numberId}/sms`);
      return response.data;
    } catch (error) {
      console.error(`Error checking SMS for ${numberId}:`, error);
      return null;
    }
  },

  getGlobalServices: async () => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.get('/user/services-list');
      return response.data;
    } catch (error) {
      console.error('Error fetching services list:', error);
      return null;
    }
  }
};
