import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}

  async sendLoginCode(email: string, code: string): Promise<void> {
    if (this.allowDevInbox()) {
      return;
    }

    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Set RESEND_API_KEY on Railway.',
      );
    }

    const from = this.config.get<string>('MAIL_FROM') ?? 'Canopy <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Your Canopy sign-in code',
        text: `Your Canopy code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Could not send the sign-in email. Try again.');
    }
  }

  allowDevInbox(): boolean {
    return (
      this.config.get<string>('MAIL_DEV_RETURN_CODE') === 'true' &&
      process.env.NODE_ENV !== 'production'
    );
  }
}
