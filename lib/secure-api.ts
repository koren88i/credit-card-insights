import { getApiToken } from './api-token';
import { guardLocalRequest } from './request-security';

export function secureApi(handler: (request: Request) => Response | Promise<Response>) {
  return async (request: Request) => {
    const denied = guardLocalRequest(request, getApiToken);
    if (denied) return denied;
    return handler(request);
  };
}
