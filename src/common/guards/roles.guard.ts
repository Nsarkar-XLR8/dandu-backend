import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { userRole } from '../../auth/interfaces/auth.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<userRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true; // No roles restricted
    }

    const { user } = context.switchToHttp().getRequest();
    
    // AuthGuard should run first and populate req.user
    if (!user || !user.role) {
      return false;
    }

    return requiredRoles.includes(user.role);
  }
}
