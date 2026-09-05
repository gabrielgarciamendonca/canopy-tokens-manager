import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendLoginCode(email: string, code: string): Promise<void> {
    if (this.allowDevInbox()) {
      return;
    }

    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Set RESEND_API_KEY on Railway.',
      );
    }

    const from = this.resolveFrom();
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
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
    } catch {
      throw new ServiceUnavailableException('Could not reach the mail provider. Try again.');
    }

    if (response.ok) {
      return;
    }

    const detail = await readResendMessage(response);
    this.logger.error(`Resend ${response.status}: ${detail || 'no body'}`);
    throw new ServiceUnavailableException(mapResendError(response.status, detail));
  }

  allowDevInbox(): boolean {
    return (
      this.config.get<string>('MAIL_DEV_RETURN_CODE') === 'true' &&
      process.env.NODE_ENV !== 'production'
    );
  }

  private resolveFrom(): string {
    const configured = this.config.get<string>('MAIL_FROM')?.trim();
    if (!configured) {
      throw new ServiceUnavailableException(
        'Set MAIL_FROM on Railway to an address on your verified Resend domain, e.g. Canopy <login@your-domain.com>.',
      );
    }
    return configured.includes('<') ? configured : `Canopy <${configured}>`;
  }
}

async function readResendMessage(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const body = JSON.parse(raw) as { message?: string };
    return body.message?.trim() ?? raw.slice(0, 240);
  } catch {
    return raw.slice(0, 240);
  }
}

function mapResendError(status: number, detail: string): string {
  const text = detail.toLowerCase();
  if (status === 401 || text.includes('api key')) {
    return 'RESEND_API_KEY is invalid. Create a new key in Resend and update Railway.';
  }
  if (text.includes('only send testing emails') || text.includes('verify a domain')) {
    return 'Resend test mode can only send to the email of the Resend account. Use that inbox, or verify a domain.';
  }
  if (text.includes('domain is not verified') || text.includes('from')) {
    return 'MAIL_FROM must be an address on your verified Resend domain.';
  }
  return detail || 'Could not send the sign-in email. Try again.';
}
