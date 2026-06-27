/**
 * Testes Unitários para Media Module
 */

import { describe, it, expect } from 'vitest';
import { validateMediaType, type MediaType } from './media.js';

describe('validateMediaType', () => {
  it('deve validar tipo de mídia válido', () => {
    expect(validateMediaType('image')).toBe(true);
    expect(validateMediaType('video')).toBe(true);
    expect(validateMediaType('audio')).toBe(true);
    expect(validateMediaType('document')).toBe(true);
    expect(validateMediaType('sticker')).toBe(true);
  });

  it('deve rejeitar tipo de mídia inválido', () => {
    expect(validateMediaType('pdf')).toBe(false);
    expect(validateMediaType('exe')).toBe(false);
    expect(validateMediaType('')).toBe(false);
  });

  it('deve validar mimetype para image', () => {
    expect(validateMediaType('image', 'image/jpeg')).toBe(true);
    expect(validateMediaType('image', 'image/png')).toBe(true);
    expect(validateMediaType('image', 'image/gif')).toBe(true);
    expect(validateMediaType('image', 'image/webp')).toBe(true);
    expect(validateMediaType('image', 'application/pdf')).toBe(false);
  });

  it('deve validar mimetype para video', () => {
    expect(validateMediaType('video', 'video/mp4')).toBe(true);
    expect(validateMediaType('video', 'video/3gpp')).toBe(true);
    expect(validateMediaType('video', 'video/quicktime')).toBe(true);
    expect(validateMediaType('video', 'image/jpeg')).toBe(false);
  });

  it('deve validar mimetype para audio', () => {
    expect(validateMediaType('audio', 'audio/mpeg')).toBe(true);
    expect(validateMediaType('audio', 'audio/ogg')).toBe(true);
    expect(validateMediaType('audio', 'audio/mp4')).toBe(true);
    expect(validateMediaType('audio', 'audio/aac')).toBe(true);
    expect(validateMediaType('audio', 'video/mp4')).toBe(false);
  });

  it('deve validar mimetype para document', () => {
    expect(validateMediaType('document', 'application/pdf')).toBe(true);
    expect(validateMediaType('document', 'application/msword')).toBe(true);
    expect(validateMediaType('document', 'text/plain')).toBe(false);
  });

  it('deve validar mimetype para sticker', () => {
    expect(validateMediaType('sticker', 'image/webp')).toBe(true);
    expect(validateMediaType('sticker', 'image/png')).toBe(false);
    expect(validateMediaType('sticker', 'image/jpeg')).toBe(false);
  });

  it('deve aceitar qualquer mimetype quando não fornecido', () => {
    expect(validateMediaType('image')).toBe(true);
    expect(validateMediaType('document')).toBe(true);
  });
});