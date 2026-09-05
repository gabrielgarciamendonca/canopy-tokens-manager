import { IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitJoinDto {
  @IsString()
  @MinLength(32)
  @MaxLength(1_000_000)
  offer!: string;
}
