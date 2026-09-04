import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @MinLength(32)
  @MaxLength(1_000_000)
  offer!: string;
}
