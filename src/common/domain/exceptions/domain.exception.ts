/**
 * Base Domain Exception
 *
 * All domain-level exceptions extend this class. These are infrastructure-agnostic
 * and represent business rule violations or domain invariant breaches.
 *
 * Why not use NestJS HttpException directly?
 * → The domain layer must not know about HTTP. These exceptions are caught by
 *   the infrastructure layer (controllers/filters) and mapped to HTTP responses.
 */
export enum DomainErrorCategory {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL = 'INTERNAL',
}

export class DomainException extends Error {
  public readonly category: DomainErrorCategory;
  public readonly code: string;

  constructor(
    message: string,
    category: DomainErrorCategory = DomainErrorCategory.INTERNAL,
    code: string = 'DOMAIN_ERROR',
  ) {
    super(message);
    this.name = this.constructor.name;
    this.category = category;
    this.code = code;
    // Maintains proper stack trace for where our error was thrown (V8 engines)
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when an entity is not found by its identifier.
 */
export class EntityNotFoundException extends DomainException {
  constructor(entityName: string, identifier: string) {
    super(
      `${entityName} not found with identifier: ${identifier}`,
      DomainErrorCategory.NOT_FOUND,
      'ENTITY_NOT_FOUND',
    );
  }
}

/**
 * Thrown when attempting to create a duplicate entity
 * (e.g., unique constraint violation at the domain level).
 */
export class DuplicateEntityException extends DomainException {
  constructor(entityName: string, field: string, value: string) {
    super(
      `${entityName} with ${field} "${value}" already exists`,
      DomainErrorCategory.CONFLICT,
      'DUPLICATE_ENTITY',
    );
  }
}

/**
 * Thrown when a user lacks permission to perform an action on a resource.
 * This is domain-level authorization, not authentication.
 */
export class AuthorizationException extends DomainException {
  constructor(
    message: string = 'You do not have permission to perform this action',
  ) {
    super(message, DomainErrorCategory.AUTHORIZATION, 'AUTHORIZATION_DENIED');
  }
}

/**
 * Thrown when domain validation rules are violated.
 * Distinct from DTO validation — this is business logic validation
 * (e.g., invalid state transition, invalid date range).
 */
export class DomainValidationException extends DomainException {
  public readonly violations: ValidationViolation[];

  constructor(message: string, violations: ValidationViolation[] = []) {
    super(message, DomainErrorCategory.VALIDATION, 'VALIDATION_FAILED');
    this.violations = violations;
  }
}

/**
 * Thrown when a transaction fails at the domain/infrastructure boundary.
 */
export class TransactionFailedException extends DomainException {
  constructor(operation: string, reason?: string) {
    super(
      `Transaction failed during ${operation}${reason ? `: ${reason}` : ''}`,
      DomainErrorCategory.INTERNAL,
      'TRANSACTION_FAILED',
    );
  }
}

/**
 * Represents a single field validation violation.
 */
export interface ValidationViolation {
  field: string;
  message: string;
  value?: unknown;
}
