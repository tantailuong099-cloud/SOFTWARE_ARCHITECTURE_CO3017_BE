import { requireSigningKey } from '../../config/signing-keys';
import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export interface JwtSignOptions extends jwt.SignOptions {
  secret?: string;
}

export interface JwtVerifyOptions extends jwt.VerifyOptions {
  secret?: string;
}

@Injectable()
export class JwtService {
  async signAsync(
    payload: string | Buffer | object,
    options?: JwtSignOptions,
  ): Promise<string> {
    const secret = options?.secret ?? requireSigningKey('JWT_SECRET');
    const signOpts: jwt.SignOptions = { ...(options ?? {}) };
    delete (signOpts as Record<string, unknown>).secret;

    return new Promise((resolve, reject) => {
      jwt.sign(payload, secret, signOpts, (err, token) => {
        if (err || !token) {
          reject(err ?? new Error('Không thể tạo JWT token'));
        } else {
          resolve(token);
        }
      });
    });
  }

  async verifyAsync<T extends object = Record<string, unknown>>(
    token: string,
    options?: JwtVerifyOptions,
  ): Promise<T> {
    const secret = options?.secret ?? requireSigningKey('JWT_SECRET');
    const verifyOpts: jwt.VerifyOptions = { ...(options ?? {}) };
    delete (verifyOpts as Record<string, unknown>).secret;

    return new Promise((resolve, reject) => {
      jwt.verify(token, secret, verifyOpts, (err, decoded) => {
        if (err || !decoded) {
          reject(err ?? new Error('Token không hợp lệ'));
        } else {
          resolve(decoded as T);
        }
      });
    });
  }
}
