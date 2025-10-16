// src/services/API.ts

import { IOverviewAttendanceData } from '@/@types/attendance';
import { PORTAL_DOMAIN } from '@/constants/config';
import logger from '@/utils/logger';

interface APIResponse<T> {
  jsonrpc: string;
  id?: number;
  result?: T;
  error?: string;
}

interface APIErrorResponse {
  error: string;
  details?: any;
  result: undefined;
}

type UserIdResponse = APIResponse<any> | APIErrorResponse;
type UserDataResponse = APIResponse<any> | APIErrorResponse;

const BASE_URL = `https://${PORTAL_DOMAIN}`;

class APIService {
  getHeader(sessionHeader: string): HeadersInit {
    return {
      Cookie: sessionHeader,
      'Content-Type': 'application/json',
      Accept: '*/*',
      Connection: 'keep-alive',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
      Origin: BASE_URL,
      Referer: `${BASE_URL}/web`,
      'Access-Control-Allow-Origin': '*',
    };
  }

  async fetchUserId(sessionHeader: string, email: string): Promise<UserIdResponse> {
    try {
      const response = await fetch(`${BASE_URL}/web/dataset/search_read`, {
        mode: 'cors',
        headers: this.getHeader(sessionHeader),
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            limit: 1,
            model: 'hr.employee',
            sort: 'create_date DESC',
            domain: ['|', ['work_email', 'ilike', email], ['name', 'ilike', email]],
            context: { lang: 'en_US' },
            fields: ['attendance_machine_id', 'name', 'work_email'],
          },
        }),
      });
      if (!response.ok) {
        logger.error('Fetch User ID failed with status:', response.status);
        return { error: `HTTP error ${response.status}`, result: undefined };
      }
      return await response.json();
    } catch (error) {
      logger.error('Error while fetching user ID:', error);
      return {
        error: 'Network or parsing error during fetchUserId',
        details: error,
        result: undefined,
      };
    }
  }

  async fetchUserOverallData(sessionHeader: string) {
    try {
      const response = await fetch(`${BASE_URL}/web/dataset/search_read`, {
        mode: 'cors',
        headers: this.getHeader(sessionHeader),
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'employee.attendance.analysis',
            domain: [],
            fields: ['order_id', 'name', 'operation', 'time_display', 'amount', 'line_number'],
            limit: 40,
            sort: '',
            context: { lang: 'en_US' },
          },
          id: 0,
        }),
      });

      if (response.ok) {
        const result: APIResponse<IOverviewAttendanceData[]> = await response.json();

        if (result.error) {
          logger.error('Fetch User overall data failed with error:', result.error);
          return { error: result.error, result: undefined };
        }

        return { result, error: undefined };
      } else {
        logger.error('Fetch User overall data failed with status:', response.status);
        return { error: `HTTP error ${response.status}`, result: undefined };
      }
    } catch (error) {
      logger.error('Error while fetching user overall data:', error);
      return {
        error: 'Network or parsing error during fetchUserOverallData',
        details: error,
        result: undefined,
      };
    }
  }

  async fetchUserData(sessionHeader: string, userId: string, from: string, to: string): Promise<UserDataResponse> {
    try {
      const response = await fetch(`${BASE_URL}/web/dataset/search_read`, {
        mode: 'cors',
        headers: this.getHeader(sessionHeader),
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'hr.attendance',
            domain: [
              '&',
              '&',
              ['date_check', '>=', from],
              ['date_check', '<', to],
              ['employee_id.attendance_machine_id', '=', userId],
            ],
            fields: [
              'timekeeping_code',
              'employee_id',
              'date_check',
              'check_in',
              'check_out',
              'minus_fund',
              'work_lack',
              'work_number',
              'leave_ids',
              'total_work_number',
              'is_weekend',
              'is_holiday',
            ],
            limit: 100,
            sort: '',
            context: { lang: 'en_US' },
          },
          id: 0,
        }),
      });
      if (!response.ok) {
        logger.error('Fetch User Data failed with status:', response.status);
        return { error: `HTTP error ${response.status}`, result: undefined };
      }
      return await response.json();
    } catch (error) {
      logger.error('Error while fetching user data:', error);
      return {
        error: 'Network or parsing error during fetchUserData',
        details: error,
        result: undefined,
      };
    }
  }

  async retrieveUserPortalHompage(header: string) {
    try {
      const response = await fetch(`${BASE_URL}/web`, {
        mode: 'cors',
        headers: { ...this.getHeader(header), 'Content-Type': 'text/html' },
        method: 'GET',
      });

      if (response.ok) {
        return { result: await response.text(), error: undefined };
      } else {
        logger.error('Retrieve User Portal Hompage failed with status:', response.status);
        return { error: `HTTP error ${response.status}`, result: undefined };
      }
    } catch (error) {
      logger.error('Error while retrieving user portal homepage:', error);
      return {
        error: 'Network or parsing error during retrieveUserPortalHompage',
        details: error,
        result: undefined,
      };
    }
  }
}

export default APIService;
