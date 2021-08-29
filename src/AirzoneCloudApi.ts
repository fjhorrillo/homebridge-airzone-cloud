/**
 * AirzoneCloud: represent the AirzoneCloud API.
 */

import { AirzoneCloudHomebridgePlatform } from './platform';

import fetch = require('node-fetch');

import { API_LOGIN, API_REFRESH_TOKEN, API_INSTALLATIONS, API_DEVICES } from './constants';
import { URL, URLSearchParams } from 'url';

enum HTTPMethod {
  POST = 'POST',
  GET = 'GET',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE'
}

/* Allow to connect to AirzoneCloud API */
export class AirzoneCloudApi {
  private _username: string;
  private _password: string;
  private _user_agent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile';
  private _base_url = 'https://m.airzonecloud.com';
  private _token?: string;
  private _refreshToken?: string;

  /* Initialize API connection */
  private constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    username: string,
    password: string,
    user_agent: string,
    base_url: string,
  ) {
    this._username = username;
    this._password = password;
    if (user_agent) {
      this._user_agent = user_agent!;
    }
    if (base_url) {
      this._base_url = base_url!;
    }
  }

  /* This is for syncronice initialization */
  public static async createAirzoneCloudApi(
    platform: AirzoneCloudHomebridgePlatform,
    username: string,
    password: string,
    user_agent: string,
    base_url: string,
  ): Promise<AirzoneCloudApi> {
    // constructor
    const airzoneCloudApi = new AirzoneCloudApi(platform, username, password, user_agent, base_url);

    // login
    await airzoneCloudApi._login();

    return airzoneCloudApi;
  }

  /*
   * private
   */

  /* Login to AirzoneCloud and return token */
  public async _login(): Promise<string | undefined> {
    const options = {
      url: new URL(API_LOGIN, this._base_url),
      method: HTTPMethod.POST,
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': this._user_agent,
      },
      body: JSON.stringify({
        email: this._username,
        password: this._password,
      }),
    };
    this.platform.log.trace(`Request: ${options.method} ${options.url}`);
    const response = await fetch(options.url, options);
    if (response && response.ok) {
      const data = await response.json();
      this.platform.log.trace(`Response: ${JSON.stringify(data)}`);
      this._token = data.token;
      this._refreshToken = data.refreshToken;
      this.platform.log.info(`Login success as ${this._username}`);
      return this._token;
    } else {
      this.platform.log.error(`Unable to login to AirzoneCloud. Request: ${JSON.stringify(options)} ${JSON.stringify(response)}`);
    }
  }

  /* Do a http GET request on an api endpoint */
  private async _get(api_endpoint: string, params={}) {
    return await this._request(HTTPMethod.GET, api_endpoint, params);
  }

  /* Do a http POST request on an api endpoint */
  private async _post(api_endpoint: string, payload={}) {
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json;charset=utf-8',
      'Accept': 'application/json, text/plain, */*',
    };

    return await this._request(HTTPMethod.POST, api_endpoint, {}, headers, payload);
  }

  /* Do a http PATCH request on an api endpoint */
  private async _patch(api_endpoint: string, payload={}) {
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json;charset=utf-8',
      'Accept': 'application/json, text/plain, */*',
    };

    return await this._request(HTTPMethod.PATCH, api_endpoint, {}, headers, payload);
  }

  /* Do a http PUT request on an api endpoint */
  private async _put(api_endpoint: string, payload={}) {
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json;charset=utf-8',
      'Accept': 'application/json, text/plain, */*',
    };

    return await this._request(HTTPMethod.PUT, api_endpoint, {}, headers, payload);
  }

  /* Do a http request on an api endpoint */
  private async _request(method: string, api_endpoint: string, params={}, headers={}, json?) {
    const url = new URL(`${api_endpoint}${Object.keys(params).length > 0?`/?${new URLSearchParams(params)}`:''}`, this._base_url);

    // set body length and host
    if ((method === HTTPMethod.POST || method === HTTPMethod.PATCH || method === HTTPMethod.PUT) && json) {
      json = JSON.stringify(json!);
      headers['Content-Length'] = json!.length.toString();
      headers['Host'] = url.host;
    }

    // set user agent
    headers['User-Agent'] = this._user_agent;

    // add jwt authentication
    headers['Authorization'] = `Bearer ${this._token ? this._token : await this._login()}`;

    const options = {
      url: url,
      method: method,
      headers: headers,
      body: json,
    };
    this.platform.log.debug(`Request: ${options.method} ${options.url}`);
    const response = await fetch(options.url, options);
    if (response && response.ok) {
      if (response.status !== 204) {
        const data = await response.json();
        this.platform.log.debug(`Response: ${JSON.stringify(data)}`);
        return data;
      }
    } else if (response.status === 401 && this._refreshToken) {
      const data = await this._get(`${API_REFRESH_TOKEN}/${this._refreshToken!}`);
      if (data.token) {
        this._token = data.token;
        this._refreshToken = data.refreshToken;
        this.platform.log.info('Refresh token success');
        return await this._request(method, api_endpoint, params, headers, json);
      }
    } else {
      this.platform.log.error(`Error calling to AirzoneCloud. Status: ${response.status} ${response.statusText}`);
      this.platform.log.debug(`Response: ${JSON.stringify(response)} for Request: ${JSON.stringify(options)}`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  /*
   * public api
   */

  /**
   * Gets all installations
   *
   * @param {string} filterParam - Opcional: filtro a aplicar por 'city', 'country', 'mac' o 'name'
   * @param {string} filterValue - Req filterParam: El valor del filtro aplicado en el parámentro filterParam
   * @param {string} items - Opcional: Número de items a retornar (min: 1, max: 10)
   * @param {string} page - Opcional: Page to return of items
   * @return {Installation[]} - Datos de la instalación parseados y validados
   */
  async getInstallations(filterParam?: string, filterValue?: string, items?: number, page?: number) {
    const params = {};
    if (filterParam && filterValue) {
      params['filterParam'] = filterParam;
      params['filterValue'] = filterValue;
    }
    if (items) {
      params['items'] = items;
    }
    if (page) {
      params['page'] = page;
    }

    try {
      return (await this._get(API_INSTALLATIONS, params)).installations;
    } catch (error) {
      this.platform.log.error(error);
      throw new Error(error);
    }
  }

  /**
   * Gets the data and structure of an installation
   *
   * @param installationId - Identificador de la installación
   * @return {Installation} - Datos de la estructura de la instalación y sus zonas parseados y validados
   */
  async getInstallation(installationId: string) {
    try {
      return await this._get(`${API_INSTALLATIONS}/${installationId}`);
    } catch (error) {
      this.platform.log.error(error);
      throw new Error(error);
    }
  }


  /**
   * Gets all the webservers belonging to an installation
   *
   * @param {String} installationId - id de la instalación
   * @return {Webserver[]} - lista de webservers
   */
  async getWebservers(installationId) {
    const params = {
      'installation_id': installationId,
    };

    try {
      // TODO: add installationId
      return await this._get(`${API_DEVICES}/wwss`, params);
    } catch (error) {
      this.platform.log.error(error);
      throw new Error(error);
    }
  }

  /**
   * Gets the status of a webserver, to display in the Settings window within a zone
   *
   * @param {String} installationId - id de la instalación
   * @param {String} webserverId - id del webserver
   * @return {Webserver} - webservers
   */
  async getWebserverStatus(installationId, webserverId, devices = false) {
    const params = {
      'installation_id': installationId,
    };
    if(devices) {
      params['devices'] = 1;
    }

    try {
      const webserver = await this._get(`${API_DEVICES}/ws/${webserverId}/status`, params);
      webserver._id = webserverId;
      // TODO: add installationId
      return webserver;
    } catch (error) {
      this.platform.log.error(error);
      throw new Error(error);
    }
  }

}
