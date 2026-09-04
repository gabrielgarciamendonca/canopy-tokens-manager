import { IsEmail, MaxLength } from 'class-validator';

export class RequestCodeDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
