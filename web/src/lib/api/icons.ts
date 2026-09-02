import { z } from 'zod';
import { apiClient } from './client';

const UploadResponseSchema = z.object({
  path: z.string(),
  size: z.number(),
  mime: z.string().nullable().optional()
});
export type UploadResponse = z.infer<typeof UploadResponseSchema>;

/** POST /api/icons/upload — admin auth required, multipart `file` field. */
export async function uploadIcon(file: File): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append('file', file);
  return apiClient<UploadResponse>({
    method: 'POST',
    path: '/api/icons/upload',
    body: fd,
    responseSchema: UploadResponseSchema
  });
}
