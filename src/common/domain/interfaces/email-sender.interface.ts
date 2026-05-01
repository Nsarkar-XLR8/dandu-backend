export interface IEmailSender {
  sendVerificationEmail(
    email: string,
    username: string,
    verificationCode: string,
    authId: string,
  ): Promise<void>;

  sendWelcomeEmail(
    email: string,
    username: string,
    authId?: string,
  ): Promise<void>;
}

export const EMAIL_SENDER_TOKEN = Symbol('IEmailSender');
