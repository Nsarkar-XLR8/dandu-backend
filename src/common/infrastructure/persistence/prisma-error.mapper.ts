import { Prisma } from '@prisma/client';
import {
  DomainErrorCategory,
  DomainException,
  DuplicateEntityException,
  EntityNotFoundException,
  TransactionFailedException,
} from '../../domain/exceptions/domain.exception';

/**
 * Prisma Error Mapper
 *
 * Translates Prisma-specific error codes into domain exceptions.
 * This ensures that infrastructure errors never leak into the domain layer.
 *
 * MongoDB Prisma Error Codes Reference:
 * - P2002: Unique constraint violation
 * - P2025: Record not found (update/delete on missing record)
 * - P2028: Transaction API error
 * - P2023: Inconsistent column data (e.g., invalid ObjectId)
 *
 * Edge Case: MongoDB's P2002 error includes the constraint name in
 * `error.meta.target` as an array of field names.
 */
export class PrismaErrorMapper {
  /**
   * Maps a caught error to a domain exception.
   * If the error is not a known Prisma error, wraps it as a generic DomainException.
   *
   * @param error - The caught error
   * @param entityName - Human-readable entity name for error messages
   * @returns A DomainException (or subclass)
   */
  static toDomainException(
    error: unknown,
    entityName: string,
  ): DomainException {
    if (error instanceof DomainException) {
      return error; // Already a domain exception, passthrough
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return PrismaErrorMapper.mapKnownError(error, entityName);
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      return new DomainException(
        `Validation error for ${entityName}: ${error.message}`,
        DomainErrorCategory.VALIDATION,
        'PRISMA_VALIDATION_ERROR',
      );
    }

    // Unknown error — wrap generically
    const message =
      error instanceof Error ? error.message : 'Unknown database error';
    return new DomainException(
      `Database error for ${entityName}: ${message}`,
      DomainErrorCategory.INTERNAL,
      'DATABASE_ERROR',
    );
  }

  private static mapKnownError(
    error: Prisma.PrismaClientKnownRequestError,
    entityName: string,
  ): DomainException {
    switch (error.code) {
      case 'P2002': {
        // Unique constraint violation
        const target = (error.meta?.target as string[]) || ['unknown field'];
        const field = target.join(', ');
        return new DuplicateEntityException(
          entityName,
          field,
          'already exists',
        );
      }

      case 'P2025': {
        // Record not found
        const cause =
          typeof error.meta?.cause === 'string' ? error.meta.cause : 'unknown';
        return new EntityNotFoundException(entityName, cause);
      }

      case 'P2028': {
        // Transaction API error
        return new TransactionFailedException(
          `${entityName} operation`,
          error.message,
        );
      }

      case 'P2023': {
        // Invalid ObjectId format
        return new DomainException(
          `Invalid ID format for ${entityName}. Expected a valid MongoDB ObjectId.`,
          DomainErrorCategory.VALIDATION,
          'INVALID_ID_FORMAT',
        );
      }

      default: {
        return new DomainException(
          `Database error for ${entityName}: ${error.message} (code: ${error.code})`,
          DomainErrorCategory.INTERNAL,
          `PRISMA_${error.code}`,
        );
      }
    }
  }
}
