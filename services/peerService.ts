import Peer, { DataConnection } from 'peerjs';
import { NetworkMessage } from '../types';

export class PeerService {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private myId: string = '';
  
  // Callbacks
  public onConnect?: (partnerId: string) => void;
  public onData?: (data: NetworkMessage) => void;
  public onDisconnect?: () => void;

  constructor() {}

  async init(givenId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // If givenId is provided, we try to use it (optional feature, usually we let PeerJS assign)
      this.peer = new Peer(givenId || '', {
        debug: 1
      });

      this.peer.on('open', (id) => {
        console.log('My Peer ID is: ' + id);
        this.myId = id;
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        reject(err);
      });
      
      this.peer.on('disconnected', () => {
        this.onDisconnect?.();
      });
    });
  }

  connect(peerId: string) {
    if (!this.peer) return;
    const conn = this.peer.connect(peerId);
    this.handleConnection(conn);
  }

  private handleConnection(conn: DataConnection) {
    this.conn = conn;

    this.conn.on('open', () => {
      console.log('Connected to: ' + conn.peer);
      this.onConnect?.(conn.peer);
    });

    this.conn.on('data', (data) => {
      this.onData?.(data as NetworkMessage);
    });

    this.conn.on('close', () => {
      console.log('Connection closed');
      this.onDisconnect?.();
      this.conn = null;
    });

    this.conn.on('error', (err) => {
        console.error('Connection error', err);
        this.onDisconnect?.();
    });
  }

  send(data: NetworkMessage) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  getId() {
    return this.myId;
  }

  destroy() {
    if (this.conn) {
      this.conn.close();
    }
    if (this.peer) {
      this.peer.destroy();
    }
  }
}
