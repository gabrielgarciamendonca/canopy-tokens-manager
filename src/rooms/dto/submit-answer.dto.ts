import { IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitAnswerDto {
  @IsString()
  @MinLength(32)
  @MaxLength(1_000_000)
  answer!: string;
}
