// Domain errors carry the HTTP status the API should return, so the transport
// layer can translate them without knowing their origin.

export class DomainError extends Error {
  constructor(message, statusCode = 400, detail) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

// Raised when a rating or response refers to a language or concept that has not
// been provisioned. Reference data is expected to be synced to a device or
// created before measurements are submitted against it.
export class ReferenceIntegrityError extends DomainError {
  constructor(detail) {
    super('Unknown language or concept', 422, detail);
    this.name = 'ReferenceIntegrityError';
  }
}
