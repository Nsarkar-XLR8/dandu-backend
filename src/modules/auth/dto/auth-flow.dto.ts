import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class ResendOtpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsIn(['registration', 'password_reset'])
  purpose?: 'registration' | 'password_reset';
}

export class VerifyOtpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsIn(['registration', 'password_reset'])
  purpose?: 'registration' | 'password_reset';
}

export class ChangePasswordDto {
  @ValidateIf((dto: ChangePasswordDto) => !dto.resetToken)
  @IsString()
  @IsNotEmpty()
  currentPassword?: string;

  @ValidateIf((dto: ChangePasswordDto) => !dto.currentPassword)
  @IsString()
  @IsNotEmpty()
  resetToken?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
