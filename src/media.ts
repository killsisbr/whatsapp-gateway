/**
 * Envio de Mídia para WhatsApp Gateway
 *
 * Suporta: imagem, áudio, vídeo, documento, sticker
 */

import { logger } from './logger.js';

export type MediaType = 'image' | 'audio' | 'document' | 'video' | 'sticker';

export interface MediaMessage {
  to: string;
  type: MediaType;
  caption?: string;
  filename?: string;
  mimetype?: string;
}

export interface MediaUrl extends MediaMessage {
  url: string; // URL pública ou base64
}

export interface MediaFile extends MediaMessage {
  file: Buffer; // Arquivo em buffer
}

/**
 * Envia mídia a partir de URL
 */
export async function sendMediaFromUrl(
  whatsappClient: any,
  message: MediaUrl
): Promise<{ messageId: string }> {
  const { to, type, url, caption, filename, mimetype } = message;

  logger.info('Sending media from URL', { to, type, url });

  try {
    let result;

    switch (type) {
      case 'image':
        result = await whatsappClient.sendMessage(to, {
          image: { url },
          caption: caption || '',
        });
        break;

      case 'video':
        result = await whatsappClient.sendMessage(to, {
          video: { url },
          caption: caption || '',
          mimetype: mimetype || 'video/mp4',
        });
        break;

      case 'audio':
        result = await whatsappClient.sendMessage(to, {
          audio: { url },
          mimetype: mimetype || 'audio/mpeg',
          ptt: mimetype?.includes('ogg'), // Push-to-talk se for Ogg
        });
        break;

      case 'document':
        result = await whatsappClient.sendMessage(to, {
          document: { url },
          fileName: filename || 'document',
          mimetype: mimetype || 'application/octet-stream',
        });
        break;

      case 'sticker':
        result = await whatsappClient.sendMessage(to, {
          sticker: { url },
        });
        break;

      default:
        throw new Error(`Unsupported media type: ${type}`);
    }

    logger.info('Media sent successfully', { to, type, messageId: result?.key?.id });

    return {
      messageId: result?.key?.id || `media_${Date.now()}`,
    };
  } catch (error) {
    logger.error('Failed to send media', { to, type, error });
    throw error;
  }
}

/**
 * Envia mídia a partir de Buffer
 */
export async function sendMediaFromBuffer(
  whatsappClient: any,
  message: MediaFile
): Promise<{ messageId: string }> {
  const { to, type, file, caption, filename, mimetype } = message;

  logger.info('Sending media from buffer', { to, type, size: file.length });

  try {
    let result;

    switch (type) {
      case 'image':
        result = await whatsappClient.sendMessage(to, {
          image: file,
          caption: caption || '',
        });
        break;

      case 'video':
        result = await whatsappClient.sendMessage(to, {
          video: file,
          caption: caption || '',
          mimetype: mimetype || 'video/mp4',
        });
        break;

      case 'audio':
        result = await whatsappClient.sendMessage(to, {
          audio: file,
          mimetype: mimetype || 'audio/mpeg',
        });
        break;

      case 'document':
        result = await whatsappClient.sendMessage(to, {
          document: file,
          fileName: filename || 'document',
          mimetype: mimetype || 'application/octet-stream',
        });
        break;

      case 'sticker':
        result = await whatsappClient.sendMessage(to, {
          sticker: file,
        });
        break;

      default:
        throw new Error(`Unsupported media type: ${type}`);
    }

    logger.info('Media sent successfully', { to, type, messageId: result?.key?.id });

    return {
      messageId: result?.key?.id || `media_${Date.now()}`,
    };
  } catch (error) {
    logger.error('Failed to send media', { to, type, error });
    throw error;
  }
}

/**
 * Valida tipo de mídia e mimetype
 */
export function validateMediaType(type: string, mimetype?: string): boolean {
  const validTypes = ['image', 'audio', 'video', 'document', 'sticker'];

  if (!validTypes.includes(type)) {
    return false;
  }

  // Valida mimetype se fornecido
  if (mimetype) {
    const validMimetypes: Record<MediaType, string[]> = {
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      audio: ['audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/aac'],
      video: ['video/mp4', 'video/3gpp', 'video/quicktime'],
      document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.*'],
      sticker: ['image/webp'],
    };

    const typeMimetypes = validMimetypes[type as MediaType] || [];
    const isValid = typeMimetypes.some(m => mimetype.includes(m.replace('*', '')));

    if (!isValid) {
      logger.warn('Invalid mimetype for media type', { type, mimetype });
      return false;
    }
  }

  return true;
}

export default {
  sendMediaFromUrl,
  sendMediaFromBuffer,
  validateMediaType,
};