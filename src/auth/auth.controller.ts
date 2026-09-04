import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { PublicUser } from '../users/user';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-code')
  requestCode(@Body() body: RequestCodeDto) {
    return this.auth.requestCode(body.email);
  }

  @Post('verify')
  verify(@Body() body: VerifyCodeDto) {
    return this.auth.verifyCode(body.email, body.code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: PublicUser) {
    return this.auth.me(user.id);
  }
}
