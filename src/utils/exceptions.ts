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