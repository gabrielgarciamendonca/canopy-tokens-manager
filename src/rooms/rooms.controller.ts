import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { PublicUser } from '../users/user';
import { CreateRoomDto } from './dto/create-room.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  create(@CurrentUser() user: PublicUser, @Body() body: CreateRoomDto) {
    return this.rooms.create(user, body.offer);
  }

  @Get(':code')
  getOffer(@Param('code') code: string) {
    return this.rooms.getOffer(code);
  }

  @Put(':code/answer')
  submitAnswer(
    @CurrentUser() user: PublicUser,
    @Param('code') code: string,
    @Body() body: SubmitAnswerDto,
  ) {
    return this.rooms.submitAnswer(code, user, body.answer);
  }

  @Get(':code/answer')
  getAnswer(@CurrentUser() user: PublicUser, @Param('code') code: string) {
    return this.rooms.getAnswer(code, user);
  }
}
