import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [UsersModule],
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
