export class LighterException extends Error {
  public status: number | undefined;
  public code: string | undefined;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'LighterException';
    this.status = status;
    this.code = code;
  }
}

export class ApiException extends LighterException {
  constructor(message: string, status?: number, code?: string) {
    super(message, status, code);
    this.name = 'ApiException';
  }
}

export class BadRequestException extends ApiException {
  constructor(message: string, code?: string) {
    super(message, 400, code);
    this.name = 'BadRequestException';
  }
}

export class UnauthorizedException extends ApiException {
  constructor(message: string, code?: string) {
    super(message, 401, code);
    this.name = 'UnauthorizedException';
  }
}

export class ForbiddenException extends ApiException {
  constructor(message: string, code?: string) {
    super(message, 403, code);
    this.name = 'ForbiddenException';
  }
}

export class NotFoundException extends ApiException {
  constructor(message: string, code?: string) {
    super(message, 404, code);
    this.name = 'NotFoundException';
  }
}

export class TooManyRequestsException extends ApiException {
  constructor(message: string, code?: string) {
    super(message, 429, code);
    this.name = 'TooManyRequestsException';
  }
}

export class ServiceException extends ApiException {
  constructor(message: string, code?: string) {
    super(message, 500, code);
    this.name = 'ServiceException';
  }
}

export class ValidationException extends LighterException {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationException';
  }
}

export class ConfigurationException extends LighterException {
  constructor(message: string) {
    super(message, 0, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationException';
  }
}

// Transaction-specific exceptions based on Python SDK patterns
export class TransactionException extends LighterException {
  public txType: string;
  public txInfo?: any;

  constructor(message: string, txType: string, txInfo?: any) {
    super(message, 0, 'TRANSACTION_ERROR');
    this.name = 'TransactionException';
    this.txType = txType;
    this.txInfo = txInfo;
  }
}

export class SignerException extends LighterException {
  public operation: string;
  public signerType: string;

  constructor(message: string, operation: string, signerType: string) {
    super(message, 0, 'SIGNER_ERROR');
    this.name = 'SignerException';
    this.operation = operation;
    this.signerType = signerType;
  }
}

export class NonceException extends LighterException {
  public apiKeyIndex: number;
  public nonce: number;

  constructor(message: string, apiKeyIndex: number, nonce: number) {
    super(message, 0, 'NONCE_ERROR');
    this.name = 'NonceException';
    this.apiKeyIndex = apiKeyIndex;
    this.nonce = nonce;
  }
}

// Order-specific exceptions
export class OrderException extends LighterException {
  public marketIndex: number;
  public clientOrderIndex: number | undefined;

  constructor(message: string, marketIndex: number, clientOrderIndex?: number) {
    super(message, 0, 'ORDER_ERROR');
    this.name = 'OrderException';
    this.marketIndex = marketIndex;
    this.clientOrderIndex = clientOrderIndex;
  }
}

// WebSocket-specific exceptions
export class WebSocketException extends LighterException {
  public event: string;

  constructor(message: string, event: string) {
    super(message, 0, 'WEBSOCKET_ERROR');
    this.name = 'WebSocketException';
    this.event = event;
  }
}