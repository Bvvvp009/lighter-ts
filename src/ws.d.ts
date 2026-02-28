declare module 'ws' {
  // EventEmitter base class
  class EventEmitter {
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    removeListener(event: string, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string): this;
  }

  // WebSocket class from ws module (Node.js)
  class WebSocket extends EventEmitter {
    static CONNECTING: number;
    static OPEN: number;
    static CLOSING: number;
    static CLOSED: number;

    constructor(url: string, options?: any);
    
    readyState: number;
    send(data: string | ArrayBufferLike, callback?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
    
    onopen: ((this: WebSocket, ev: Event) => any) | null;
    onclose: ((this: WebSocket, ev: CloseEvent) => any) | null;
    onerror: ((this: WebSocket, ev: Event) => any) | null;
    onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null;
    
    // EventEmitter methods
    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: (code: number, reason: string) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: string | Buffer) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: 'open', listener: () => void): this;
    once(event: 'close', listener: (code: number, reason: string) => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'message', listener: (data: string | Buffer) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    
    off(event: string, listener: (...args: any[]) => void): this;
    removeListener(event: string, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string): this;
    
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  namespace WebSocket {
    type Data = string | Buffer;
  }

  interface EventListener {
    (evt: Event): void;
  }

  interface Event {
    type: string;
  }

  interface CloseEvent extends Event {
    code: number;
    reason: string;
    wasClean: boolean;
  }

  interface MessageEvent extends Event {
    data: string | Buffer;
  }

  export = WebSocket;
}


