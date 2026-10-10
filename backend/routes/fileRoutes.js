import express from 'express';
import multer from 'multer';
import {
    createFolder,
    deleteFolder,
    getFileContent,
    getFilePreviewUrl,
    getAllFolders,
    getFiles,
    getFolders,
    moveFileToFolder,
    permanentDeleteFile,
    renameFolder,
    renameFile,
    restoreFile,
    softDeleteFile,
    toggleFavorite,
    toggleFolderFavorite,
    uploadFile
} from '../controllers/fileController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();


const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } 
});

router.use(authMiddleware);

router.get('/', getFiles);
router.get('/folders/all', getAllFolders);
router.get('/folders', getFolders);
router.post('/folders', express.json(), createFolder);
router.put('/folders/:id', express.json(), renameFolder);
router.put('/folders/:id/favorite', express.json(), toggleFolderFavorite);
router.delete('/folders/:id', deleteFolder);
router.get('/:id/preview', getFilePreviewUrl);
router.get('/:id/content', getFileContent);
router.post('/upload', upload.single('file'), uploadFile);
router.put('/:id/move', express.json(), moveFileToFolder);
router.put('/:id/rename', renameFile);
router.put('/:id/favorite', toggleFavorite);
router.put('/:id/trash', softDeleteFile);
router.put('/:id/restore', restoreFile);
router.delete('/:id', permanentDeleteFile);

export default router;
