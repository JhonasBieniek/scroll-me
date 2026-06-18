import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.]+$/, {
    message: 'Username deve conter apenas letras, números, underscore e ponto.',
  })
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  displayName!: string;

  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'A senha deve ter ao menos 8 caracteres.' })
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  password!: string;
}
