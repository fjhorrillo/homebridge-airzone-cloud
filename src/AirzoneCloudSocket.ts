/**
 * AirzoneCloud: represent the AirzoneCloud Socket.
 */

import { AirzoneCloudHomebridgePlatform, LogType } from './platform';

import { io, Socket } from 'socket.io-client';

import { API_WEBSOCKETS } from './constants';
import { LogLevel } from 'homebridge';

/* Allow to connect to AirzoneCloud Socket */
export class AirzoneCloudSocket {
  private userSocket: Socket;
  private static reconnectAttemps = 0;
  private listeningInstallationId?: string;
  private listenInstallationDevices: {[key: string]: {[key: string]: unknown}} = {};
  private listeningWebserverId?: string;
  private listenFinished?: (v: boolean) => void;

  /* Create websocket to AirzoneCloud */
  constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    private readonly base_url: string,
    private jwt: string,
  ) {
    // Create socket
    this.userSocket = io(this.base_url, {
      path: API_WEBSOCKETS,
      secure: true,
      query: {
        jwt,
      },
      transports: ['websocket'],
      transportOptions: {
        polling: {
          extraHeaders: {
            'Authorization': `Bearer ${jwt}`,
          },
        },
      },
      autoConnect: false,
    });
    this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, `Websocket: ${JSON.stringify(this.userSocket.io.opts)}`);
  }

  /* Starting to listen to the events of an installation */
  public async listenInstallation(installationId: string): Promise<{[key: string]: unknown}> {
    await this.clearListeners();
    this.listeningInstallationId = installationId;
    return new Promise ((resolve, reject) => {
      this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, '\x1b[34m⬆\x1b[0m', `["listen_installation", "${installationId}"]`);
      this.userSocket.emit('listen_installation', installationId, async data => {
        // data is the response callback, it will be null if everything went well or an error in another case
        if (data !== null) {
          this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, '\x1b[31m⬇\x1b[0m', `[${JSON.stringify(data)}]`);
          switch(data._id) {
            case 'tooManyConnections':
              this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, 'Error in listenInstallation');
              return reject(new Error('tooManyConnections'));
            case 'notAuthorized':
              return reject(new Error('notAuthorized'));
            default:
              this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, `Error in listenInstallation ${data}`);
              AirzoneCloudSocket.reconnectAttemps++;
              if (AirzoneCloudSocket.reconnectAttemps <= 5) {
                this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.INFO,
                  `Reconnection attempt ${AirzoneCloudSocket.reconnectAttemps}`);

                this.disconnectSocket();
                await this.connectUserSocket(this.jwt);
                await this.listenInstallation(installationId);
              } else {
                AirzoneCloudSocket.reconnectAttemps = 0; // The attempt counter is reset
                this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, 'Error trying to reconnect from listenInstallation');
              }
          }
        } else {
          AirzoneCloudSocket.reconnectAttemps = 0; // If no error is obtained, the attempt counter is reset
          this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, '\x1b[31m⬇\x1b[0m', `[${JSON.stringify(data)}]`);
        }
        await new Promise<boolean>(resolver => this.listenFinished = resolver);
        this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.INFO, 'The installation status was fully received');
        return resolve(this.listenInstallationDevices);
      });
    });
  }

  /* Starting to listen to the events of a webserver */
  public async listenWebserver(webserverId: string) {
    await this.clearListeners();
    this.listeningWebserverId = webserverId;
    return new Promise ((resolve, reject) => {
      this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, '\x1b[34m⬆\x1b[0m', `["listen_ws", "${webserverId}"]`);
      this.userSocket.emit('listen_ws', webserverId, async data => {
        // data is the response callback, it will be null if everything went well or an error in another case
        if (data !== null) {
          this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, '\x1b[31m⬇\x1b[0m', `${JSON.stringify(data)}`);
          switch(data._id) {
            case 'tooManyConnections':
              return reject(new Error('tooManyConnections'));
            case 'notAuthorized':
              return reject(new Error('notAuthorized'));
            default:
              AirzoneCloudSocket.reconnectAttemps++;
              if (AirzoneCloudSocket.reconnectAttemps <= 5) {
                this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.INFO,
                  `Reconnection attempt ${AirzoneCloudSocket.reconnectAttemps}`);

                this.disconnectSocket();
                await this.connectUserSocket(this.jwt);
                await this.listenWebserver(webserverId);
              } else {
                AirzoneCloudSocket.reconnectAttemps = 0; // The attempt counter is reset
                this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, 'Error trying to reconnect from listenWebserver');
              }
          }
        } else {
          AirzoneCloudSocket.reconnectAttemps = 0; // If no error is obtained, the attempt counter is reset
          this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, '\x1b[31m⬇\x1b[0m', `[${JSON.stringify(data)}]`);
        }
        return resolve(true);
      });
    });
  }

  /* Stop listening for events from an installation (free socket traffic) */
  public async clearListeners(refresh = false) {
    return new Promise ((resolve, reject) => {
      this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, '\x1b[34m⬆\x1b[0m', '["clear_listeners"]');
      this.userSocket.emit('clear_listeners', data => {
        if(data !== null) {
          this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, '\x1b[31m⬇\x1b[0m', `[${JSON.stringify(data)}]`);
          return reject(new Error(`Error sending 'clear_listeners' message. ${JSON.stringify(data)}`));
        } else {
          if (!refresh) {
            this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, 'Cleaned cached installationId and webserverId');
            this.listeningInstallationId = undefined;
            this.listeningWebserverId = undefined;
          }
          this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, '\x1b[31m⬇\x1b[0m', `[${JSON.stringify(data)}]`);
        }
        return resolve(true);
      });
    });
  }

  /* Update jwt token */
  private _updateToken(jwt?: string) {
    if (jwt) {
      this.jwt = jwt;
      this.userSocket.io.opts.query = { jwt };
      this.userSocket.io.opts.transportOptions = {
        polling: {
          extraHeaders: {
            'Authorization': `Bearer ${jwt}`,
          },
        },
      };
      this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, `Websocket: ${JSON.stringify(this.userSocket.io.opts)}`);
    }
  }

  /* Connect from user socket */
  private _connect(jwt?: string) {
    // update jwt token
    this._updateToken(jwt);
    // connect to the socket
    this.userSocket.connect();
  }

  /* Connect from user socket and add listeners */
  public async connectUserSocket(jwt?: string) {
    return new Promise( (resolve, reject) => {
      // connect to the socket
      this._connect(jwt);
      // register a catch-all listener
      this.userSocket.onAny(async (event, ...args) => {
        this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, '\x1b[31m⬇\x1b[0m',
          `${args?JSON.stringify([event].concat(args.filter((arg)=> {
            return !(arg instanceof Function);
          }))):[event]}`);

        // event data
        const eventProps = typeof event === 'string' ? event.split('.') : [];
        event = {
          name: eventProps[0],
          type: eventProps[1] === undefined ? null : eventProps[1],
          deviceId: eventProps[2] === undefined ? null : eventProps[2],

        };
        const receivedData = args[0];

        switch(event.name) {
          case 'USERS':
            if (event.type === 'update' && receivedData.param === 'units') {
              Object.keys(this.listenInstallationDevices).forEach( deviceId => {
                this.listenInstallationDevices[deviceId].units = receivedData.value;
              });
            }
            break;
          case 'DEVICE_STATE':
            this.listenInstallationDevices[receivedData.device_id] = { units: 0 };
            this.handlerReceivedData(event.name, receivedData);
            break;
          case 'DEVICE_STATE_END':
            if (this.listenFinished) {
              this.listenFinished(true);
            }
            break;
          case 'DEVICES_UPDATES':
            this.handlerReceivedData(event.name, receivedData);
            break;
        }
      });

      this.userSocket.on('connect', async () => {
        this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.INFO, 'Websocket connected');
        await this.refreshListeners();
        resolve(true);
      });

      // The disconnect event takes the user out of the socket.
      // It may be because all the sessions have been closed or because the user has been deleted. Cleansed.
      this.userSocket.on('disconnect', async error => {
        this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, `Disconnect: ${JSON.stringify(error)}`);
        if (error === 'io server disconnect') {
          try {
            // update jwt token
            this._connect(await this.platform.airzoneCloudApi.refreshToken());
            await this.refreshListeners();
          } catch (error) {
            this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, `Error in disconnect ${error}`);
          }
        } else {
          this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, 'Disconnect due to red disconnection');
        }
      });

      this.userSocket.on('error', async error => {
        this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, `Socket connect error ${JSON.stringify(error)}`);
        if(error['description'] === 401) {
          this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, 'Error 401 socketservice');
          try {
            this._updateToken(await this.platform.airzoneCloudApi.refreshToken());
          } catch (error) {
            this.disconnectSocket();
            reject(new Error(`socketConnectError ${error}`));
          }
        } else {
          this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.ERROR, 'Disconnect due to red disconnection');
          if(error['type'] === 'TransportError') {
            this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, 'Disconnect for transportError');
          }
          this.disconnectSocket();
          reject(new Error('socketConnectError'));
        }
      });

      this.userSocket.on('reconnect', async attempt => {
        this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.INFO, `Reconected after ${attempt} attempt(s)`);
        this.refreshListeners();
      });

      this.userSocket.on('auth', async (event, callback) => {
        if(event === 'authenticate') {
          this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, '\x1b[34m⬆\x1b[0m', `["${this.jwt}"]`);
          callback(this.jwt);
        }
        this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, 'authenticate event, replied with a valid token');
      });
    });
  }

  /* Disconnect from user socket */
  public disconnectSocket() {
    this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.INFO, 'Disconnect socket requested', this.userSocket);
    this.userSocket.close();
  }

  /* Retrieves the information of all Devices of an updated installation */
  async refreshListeners() {
    // Clear listeners
    await this.clearListeners(true);

    if (this.listeningInstallationId) {
      this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG,
        `Refresh listener for installation ${this.listeningInstallationId}`);
      // Reconnect to get the updated information
      await this.listenInstallation(this.listeningInstallationId);
    } else if (this.listeningWebserverId) {
      this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.DEBUG, `Refresh listener for webserver ${this.listeningWebserverId}`);
      // Reconnect to get the updated information
      await this.listenWebserver(this.listeningWebserverId);
    }
  }

  handlerReceivedData(eventName: string, event) {
    const status = (event.change !== undefined) ?
      (event.change.status !== undefined ? event.change.status : {}) :
      (event.status !== undefined ? event.status : {});

    const data = this.listenInstallationDevices[event.device_id];
    if (data) {
      Object.keys(status).forEach( param => {
        if ([
          'power',
          'humidity',
          'local_temp',
          'setpoint_air_stop',
          'setpoint_air_auto',
          'setpoint_air_cool',
          'setpoint_air_heat',
          'setpoint_air_vent',
          'setpoint_air_dry',
          'step',
          'mode',
          'mode_available',
        ].includes(param)) {
          data[param] = status[param];
        }
      });
    } else {
      this.platform.log.logFormatted(LogType.WEBSOCKET, LogLevel.WARN, `[${eventName}] Event not implemented. ${JSON.stringify(event)}`);
    }
  }

  public allOtherOff(deviceId: string): boolean {
    let allOtherOff = true;
    Object.keys(this.listenInstallationDevices).forEach(device_id => {
      if (deviceId !== device_id) {
        allOtherOff &&= !this.listenInstallationDevices[device_id].power;
      }
    });
    return allOtherOff;
  }

}
