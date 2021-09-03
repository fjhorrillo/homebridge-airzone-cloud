/**
 * AirzoneCloud: represent the AirzoneCloud Socket.
 */

import { AirzoneCloudHomebridgePlatform } from './platform';

import { io, Socket } from 'socket.io-client';

import { API_WEBSOCKETS } from './constants';

/* Allow to connect to AirzoneCloud Socket */
export class AirzoneCloudSocket {
  private userSocket: Socket;
  private static reconnectAttemps = 0;
  private listeningInstallationId?: string;
  private listeningWebserverId?: string;

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
    this.platform.log.debug(`Websocket: ${JSON.stringify(this.userSocket.io.opts)}`);
  }

  /* Starting to listen to the events of an installation */
  public async listenInstallation(installationId: string) {
    this.listeningInstallationId = installationId;
    await this.clearListeners();
    return new Promise ((resolve, reject) => {
      this.platform.log.info(`\x1b[35m[Websocket]\x1b[0m \x1b[34m⬆\x1b[0m \x1b[33m["listen_installation", "${installationId}"]\x1b[0m`);
      this.userSocket.emit('listen_installation', installationId, async data => {
        // data is the response callback, it will be null if everything went well or an error in another case
        if (data !== null) {
          this.platform.log.error(`\x1b[35m[Websocket]\x1b[0m \x1b[31m⬇\x1b[0m \x1b[33m${JSON.stringify(data)}\x1b[0m`);
          switch(data._id) {
            case 'tooManyConnections':
              this.platform.log.error('Error in listenInstallation');
              return reject(new Error('tooManyConnections'));
            case 'notAuthorized':
              return reject(new Error('notAuthorized'));
            default:
              this.platform.log.error(`Error in listenInstallation ${data}`);
              AirzoneCloudSocket.reconnectAttemps++;
              if (AirzoneCloudSocket.reconnectAttemps <= 5) {
                this.platform.log.info(`Reconnection attempt ${AirzoneCloudSocket.reconnectAttemps}`);

                this.disconnectSocket();
                await this.connectUserSocket(this.jwt);
                await this.listenInstallation(installationId);
              } else {
                AirzoneCloudSocket.reconnectAttemps = 0; // The attempt counter is reset
                this.platform.log.error('Error trying to reconnect from listenInstallation');
              }
          }
        } else {
          AirzoneCloudSocket.reconnectAttemps = 0; // If no error is obtained, the attempt counter is reset
          this.platform.log.info(`\x1b[35m[Websocket]\x1b[0m \x1b[31m⬇\x1b[0m \x1b[33m${JSON.stringify(data)}\x1b[0m`);
        }
        return resolve(true);
      });
    });
  }

  /* Starting to listen to the events of a webserver */
  public async listenWebserver(webserverId: string) {
    this.listeningWebserverId = webserverId;
    await this.clearListeners();
    return new Promise ((resolve, reject) => {
      this.platform.log.info(`\x1b[35m[Websocket]\x1b[0m \x1b[34m⬆\x1b[0m \x1b[33m["listen_ws", "${webserverId}"]\x1b[0m`);
      this.userSocket.emit('listen_ws', webserverId, async data => {
        // data is the response callback, it will be null if everything went well or an error in another case
        if (data !== null) {
          this.platform.log.error(`\x1b[35m[Websocket]\x1b[0m \x1b[31m⬇\x1b[0m \x1b[33m${JSON.stringify(data)}\x1b[0m`);
          switch(data._id) {
            case 'tooManyConnections':
              return reject(new Error('tooManyConnections'));
            case 'notAuthorized':
              return reject(new Error('notAuthorized'));
            default:
              AirzoneCloudSocket.reconnectAttemps++;
              if (AirzoneCloudSocket.reconnectAttemps <= 5) {
                this.platform.log.info(`Reconnection attempt ${AirzoneCloudSocket.reconnectAttemps}`);

                this.disconnectSocket();
                await this.connectUserSocket(this.jwt);
                await this.listenWebserver(webserverId);
              } else {
                AirzoneCloudSocket.reconnectAttemps = 0; // The attempt counter is reset
                this.platform.log.error('Error trying to reconnect from listenWebserver');
              }
          }
        } else {
          AirzoneCloudSocket.reconnectAttemps = 0; // If no error is obtained, the attempt counter is reset
          this.platform.log.info(`\x1b[35m[Websocket]\x1b[0m \x1b[31m⬇\x1b[0m \x1b[33m${JSON.stringify(data)}\x1b[0m`);
        }
        return resolve(true);
      });
    });
  }

  /* Stop listening for events from an installation (free socket traffic) */
  public async clearListeners() {
    return new Promise ((resolve, reject) => {
      this.platform.log.info('\x1b[35m[Websocket]\x1b[0m \x1b[34m⬆\x1b[0m \x1b[33m["clear_listeners"]\x1b[0m');
      this.userSocket.emit('clear_listeners', data => {
        if(data !== null) {
          this.platform.log.error(`\x1b[35m[Websocket]\x1b[0m \x1b[31m⬇\x1b[0m \x1b[33m${JSON.stringify(data)}\x1b[0m`);
          return reject(new Error(`Error sending 'clear_listeners' message. ${JSON.stringify(data)}`));
        } else {
          this.listeningInstallationId = undefined;
          this.listeningWebserverId = undefined;
          this.platform.log.info(`\x1b[35m[Websocket]\x1b[0m \x1b[31m⬇\x1b[0m \x1b[33m${JSON.stringify(data)}\x1b[0m`);
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
      this.platform.log.debug(`Websocket: ${JSON.stringify(this.userSocket.io.opts)}`);
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
        this.platform.log.info(`\x1b[35m[Websocket]\x1b[0m \x1b[31m⬇\x1b[0m \x1b[33m${args?JSON.stringify([event].concat(args.filter((a)=> {
          return !(a instanceof Function);
        }))):[event]}\x1b[0m`);
      });

      this.userSocket.on('connect', async () => {
        this.platform.log.info('Websocket connected');
        resolve(true);
      });

      // The disconnect event takes the user out of the socket.
      // It may be because all the sessions have been closed or because the user has been deleted. Cleansed.
      this.userSocket.on('disconnect', async error => {
        this.platform.log.debug(`Disconnect: ${JSON.stringify(error)}`);
        if (error === 'io server disconnect') {
          try {
            // update jwt token
            this._connect(await this.platform.airzoneCloudApi.refreshToken());
            await this.refreshListeners();
          } catch (error) {
            this.platform.log.error(`Error in disconnect ${error}`);
          }
        } else {
          this.platform.log.error('Disconnect due to red disconnection');
        }
      });

      this.userSocket.io.on('error', async error => {
        this.platform.log.debug(`Disconnect socket error: ${JSON.stringify(error)}`);

        if(error['description'] === 401) {
          this.platform.log.error('Error 401 socketservice');
          try {
            this._updateToken(await this.platform.airzoneCloudApi.refreshToken());
          } catch (error) {
            this.disconnectSocket();
            this.platform.log.error(`Socket connect error ${error}`);
            reject(new Error('socketConnectError'));
          }
        } else {
          this.platform.log.error('Disconnect due to red disconnection');
          if(error['type'] === 'TransportError') {
            this.platform.log.debug('Disconnect por transportError');
          } else {
            this.disconnectSocket();
            reject(new Error('socketConnectError'));
          }
        }
      });

      this.userSocket.io.on('reconnect', async attempt => {
        this.platform.log.info(`Reconected after ${attempt} attempt(s)`);
        this.refreshListeners();
      });

      this.userSocket.on('auth', async (event, callback) => {
        if(event === 'authenticate') {
          this.platform.log.info(`\x1b[35m[Websocket]\x1b[0m \x1b[34m⬆\x1b[0m \x1b[33m["${this.jwt}"]\x1b[0m`);
          callback(this.jwt);
        }
        this.platform.log.debug('authenticate event, replied with a valid token');
      });
    });
  }

  /* Disconnect from user socket */
  public disconnectSocket() {
    this.platform.log.info('Disconnect socket lanzado', this.userSocket);
    this.userSocket.close();
  }

  /* Retrieves the information of all Devices of an updated installation */
  async refreshListeners() {
    // Clear listeners
    await this.clearListeners();

    if (this.listeningInstallationId) {
      this.platform.log.debug(`Refresh listener for installation ${this.listeningInstallationId}`);
      // Reconnect to get the updated information
      await this.listenInstallation(this.listeningInstallationId);
    } else if (this.listeningWebserverId) {
      this.platform.log.debug(`Refresh listener for webserver ${this.listeningWebserverId}`);
      // Reconnect to get the updated information
      await this.listenWebserver(this.listeningWebserverId);
    }
  }

}
