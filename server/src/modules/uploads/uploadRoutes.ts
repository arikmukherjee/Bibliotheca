import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { imageUpload, requireUploadedFile } from '../../middleware/upload.js';
import { saveCoverImage, validateImage } from '../../utils/files.js';

export const uploadRoutes = Router();

uploadRoutes.post(
  '/cover',
  imageUpload.single('image'),
  asyncHandler(async (req, res) => {
    const file = requireUploadedFile(req.file, 'Choose a cover image to upload.');
    await validateImage(file);
    const url = await saveCoverImage(file.buffer);
    res.status(201).json({ data: { url, source: 'upload' } });
  }),
);
