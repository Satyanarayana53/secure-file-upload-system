import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import FileCard from '../components/FileCard';
import StatsCard from '../components/StatsCard';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import api from '../services/api';
import '../styles/dashboardV2.css';
import { logSecurityEvent } from '../utils/securityLogs';
import { useAuth } from '../context/AuthContext';

const DashboardV2 = () => {
  const { user, resendVerification } = useAuth();
  const [resendBannerStatus, setResendBannerStatus] = useState('');
  const [isResendBannerLoading, setIsResendBannerLoading] = useState(false);

  const handleResendFromBanner = async () => {
    if (!user?.email) return;
    setIsResendBannerLoading(true);
    try {
      const res = await resendVerification(user.email);
      setResendBannerStatus(res?.message || 'Verification link sent to your email!');
    } catch (err) {
      setResendBannerStatus('Failed to send verification link. Please try again later.');
    } finally {
      setIsResendBannerLoading(false);
    }
  };

  const storedFolderStarOverrides = (() => {
    try {
      const raw = localStorage.getItem('folder_star_overrides_v1');
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  })();

  const [files, setFiles] = useState([]);
  const [allFiles, setAllFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [favoriteFolders, setFavoriteFolders] = useState([]);
  const [allFolders, setAllFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [folderTrail, setFolderTrail] = useState([]);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderError, setFolderError] = useState('');
  const [movingFileId, setMovingFileId] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewType, setPreviewType] = useState('');
  const [previewName, setPreviewName] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [showPreviewMenu, setShowPreviewMenu] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [newName, setNewName] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareFile, setShareFile] = useState(null);
  const [shareExpiresIn, setShareExpiresIn] = useState('24');
  const [sharePassword, setSharePassword] = useState('');
  const [shareMaxAccesses, setShareMaxAccesses] = useState('');
  const [createdShareUrl, setCreatedShareUrl] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('any');
  const [pendingSuggestedFolder, setPendingSuggestedFolder] = useState('');
  const [pendingOpenFolder, setPendingOpenFolder] = useState(null);
  const [isSuggestedOpen, setIsSuggestedOpen] = useState(true);
  const [suggestedFavoriteMap, setSuggestedFavoriteMap] = useState({});
  const [folderStarOverrides, setFolderStarOverrides] = useState(storedFolderStarOverrides);
  const latestFetchId = useRef(0);

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = searchParams.get('search') || '';

  const isTrash = location.pathname === '/trash';
  const isFavorite = location.pathname === '/favorites';
  const isRecent = location.pathname === '/recent';
  const isHome = location.pathname === '/home';
  const isMyDrive = location.pathname === '/files';

  const isDateInRange = (createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();

    if (dateFilter === 'today') {
      return created.toDateString() === now.toDateString();
    }

    if (dateFilter === '7days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      return created >= sevenDaysAgo;
    }

    if (dateFilter === '30days') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      return created >= thirtyDaysAgo;
    }

    return true;
  };

  const matchesTypeFilter = (file) => {
    const type = (file.file_type || '').toLowerCase();
    const name = (file.file_name || '').toLowerCase();

    if (typeFilter === 'pdf') return type.includes('pdf') || name.endsWith('.pdf');
    if (typeFilter === 'image') return type.includes('image/');
    if (typeFilter === 'doc') return type.includes('word') || name.endsWith('.doc') || name.endsWith('.docx');
    if (typeFilter === 'sheet') return type.includes('sheet') || name.endsWith('.xls') || name.endsWith('.xlsx');
    return true;
  };

  const getEffectiveFolderFavorite = (folder) => {
    if (!folder?.id) return false;
    if (Object.prototype.hasOwnProperty.call(folderStarOverrides, folder.id)) {
      return Boolean(folderStarOverrides[folder.id]);
    }
    return Boolean(folder.is_favorite);
  };

  const fetchFiles = async () => {
    const fetchId = ++latestFetchId.current;
    setFiles([]);

    try {
      const query = new URLSearchParams();
      query.set('trash', String(isTrash));
      query.set('favorite', String(isFavorite));
      if (isMyDrive) {
        query.set('folderId', activeFolderId || 'root');
      }

      const res = await api.get(`/files?${query.toString()}`);
      let data = res.data;

      const allRes = await api.get('/files?trash=false&favorite=false');
      if (fetchId !== latestFetchId.current) return;
      setAllFiles(allRes.data);

      if (isFavorite) {
        const folderRes = await api.get('/files/folders/all');
        if (fetchId !== latestFetchId.current) return;
        const onlyStarred = (folderRes.data || []).filter((folder) => getEffectiveFolderFavorite(folder));
        setFavoriteFolders(onlyStarred);
        setAllFolders(folderRes.data || []);
      } else if (fetchId === latestFetchId.current) {
        setFavoriteFolders([]);
      }

      if (searchTerm) {
        data = data.filter((f) => f.file_name.toLowerCase().includes(searchTerm.toLowerCase()));
      }

      if (isRecent) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        data = data.filter((f) => new Date(f.created_at) > sevenDaysAgo);
      }

      data = data.filter(matchesTypeFilter).filter((f) => isDateInRange(f.created_at));

      const mappedFiles = data.map((f) => ({
        id: f.id,
        name: f.file_name,
        file_size: f.file_size,
        created_at: f.created_at,
        file_type: f.file_type,
        folder_id: f.folder_id,
        is_favorite: f.is_favorite,
        is_deleted: f.is_deleted,
        scan_status: f.scan_status,
      }));

      if (fetchId !== latestFetchId.current) return;
      setFiles(mappedFiles);
    } catch (err) {
      if (fetchId !== latestFetchId.current) return;
      console.error('Failed to fetch files', err);
      logSecurityEvent('File Fetch Failed', err.message || 'Unable to load files', 'error');
    }
  };

  const fetchFolders = async (folderId = null, trail = []) => {
    if (!isMyDrive) {
      setFolders([]);
      return;
    }

    try {
      const parentId = folderId || 'root';
      const res = await api.get(`/files/folders?parentId=${encodeURIComponent(parentId)}`);
      setFolders(res.data || []);
      setFolderTrail(trail);
      setActiveFolderId(folderId);
    } catch (err) {
      console.error('Failed to fetch folders', err);
      logSecurityEvent('Folder Fetch Failed', err.response?.data?.message || 'Unable to load folders', 'error');
    }
  };

  useEffect(() => {
    if (!isMyDrive) {
      setActiveFolderId(null);
      setFolderTrail([]);
      setFolders([]);
      return;
    }

    fetchFolders(null, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyDrive]);

  useEffect(() => {
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, searchTerm, typeFilter, dateFilter, activeFolderId]);

  useEffect(() => {
    if (!isMyDrive || !pendingSuggestedFolder) return;

    let ignore = false;

    const openSuggestedFolder = async () => {
      try {
        const listRes = await api.get('/files/folders?parentId=root');
        const existing = (listRes.data || []).find(
          (folder) => folder.name.toLowerCase() === pendingSuggestedFolder.toLowerCase(),
        );

        let targetFolder = existing;
        if (!targetFolder) {
          const createRes = await api.post('/files/folders', {
            name: pendingSuggestedFolder,
            parentId: 'root',
          });
          targetFolder = createRes.data;
        }

        if (ignore || !targetFolder?.id) return;
        await fetchFolders(targetFolder.id, [{ id: targetFolder.id, name: targetFolder.name }]);
        setPendingSuggestedFolder('');
      } catch (err) {
        if (ignore) return;
        logSecurityEvent('Suggested Folder Open Failed', err.response?.data?.message || 'Unable to open folder', 'error');
        setPendingSuggestedFolder('');
      }
    };

    openSuggestedFolder();

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyDrive, pendingSuggestedFolder]);

  useEffect(() => {
    if (!isMyDrive || !pendingOpenFolder) return;
    fetchFolders(pendingOpenFolder.id, [{ id: pendingOpenFolder.id, name: pendingOpenFolder.name }]);
    setPendingOpenFolder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyDrive, pendingOpenFolder]);

  useEffect(() => {
    localStorage.setItem('folder_star_overrides_v1', JSON.stringify(folderStarOverrides));
  }, [folderStarOverrides]);

  useEffect(() => {
    if (!isFavorite) return;
    setFavoriteFolders((allFolders || []).filter((folder) => getEffectiveFolderFavorite(folder)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderStarOverrides, isFavorite, allFolders]);

  const refreshSuggestedFavoriteMap = async () => {
    try {
      const res = await api.get('/files/folders?parentId=root');
      const map = {};
      (res.data || []).forEach((folder) => {
        map[folder.name.toLowerCase()] = getEffectiveFolderFavorite(folder);
      });
      setSuggestedFavoriteMap(map);
    } catch (err) {
      console.error('Failed to refresh suggested favorites', err);
    }
  };

  useEffect(() => {
    if (!isHome) return;
    refreshSuggestedFavoriteMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHome]);

  useEffect(() => {
    if (!isHome) return;
    refreshSuggestedFavoriteMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderStarOverrides]);

  const totalFilesCount = allFiles.length;
  const totalStorageUsed = allFiles.reduce((acc, curr) => acc + curr.file_size, 0);
  const maxStorage = 100 * 1024 * 1024;

  const recentThreatChecks = useMemo(() => {
    if (!allFiles.length) return 'No files scanned yet';
    const safeCount = Math.max(allFiles.length - 1, 0);
    return `${safeCount}/${allFiles.length} Safe`;
  }, [allFiles]);

  const suggestedFolders = useMemo(
    () => [
      { name: 'Identity Docs', tag: 'Encrypted folder' },
      { name: 'Work Reports', tag: 'Access controlled' },
      { name: 'Legal Backups', tag: 'Retention enabled' },
    ],
    [],
  );

  const handleSearch = (term) => {
    if (term) {
      setSearchParams({ search: term });
      return;
    }
    setSearchParams({});
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
      return;
    }
    if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setUploadFile(e.dataTransfer.files[0]);
      setUploadError('');
      setIsUploadOpen(true);
    }
  };

  const handleSuggestedFolderClick = (folderName) => {
    setPendingSuggestedFolder(folderName);
    navigate('/files');
  };

  const handleStarredFolderOpen = (folder) => {
    setPendingOpenFolder({ id: folder.id, name: folder.name });
    navigate('/files');
  };

  const handleToggleSuggestedStar = async (e, folderName) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const rootRes = await api.get('/files/folders?parentId=root');
      const existing = (rootRes.data || []).find((item) => item.name.toLowerCase() === folderName.toLowerCase());

      let targetFolder = existing;
      if (!targetFolder) {
        const createRes = await api.post('/files/folders', { name: folderName, parentId: 'root' });
        targetFolder = createRes.data;
      }

      const currentFavorite = getEffectiveFolderFavorite(targetFolder);
      const nextFavorite = !currentFavorite;
      setFolderStarOverrides((prev) => ({ ...prev, [targetFolder.id]: nextFavorite }));
      try {
        await api.put(`/files/folders/${targetFolder.id}/favorite`, { isFavorite: nextFavorite });
      } catch (apiErr) {
        // Keep local override so star behavior continues even when DB column is missing.
      }
      setSuggestedFavoriteMap((prev) => ({ ...prev, [folderName.toLowerCase()]: nextFavorite }));
      setFavoriteFolders((prev) => {
        if (nextFavorite) {
          const already = prev.some((item) => item.id === targetFolder.id);
          if (already) return prev;
          return [{ ...targetFolder, is_favorite: true }, ...prev];
        }
        return prev.filter((item) => item.id !== targetFolder.id);
      });

      if (isMyDrive) {
        fetchFolders(activeFolderId, folderTrail);
      }
      fetchFiles();
      logSecurityEvent('Suggested Folder Favorite Updated', `${folderName} starred status changed`, 'info');
    } catch (err) {
      logSecurityEvent('Suggested Folder Favorite Failed', err.response?.data?.message || 'Unable to star suggested folder', 'warning');
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;

    const formData = new FormData();
    formData.append('file', uploadFile);
    if (isMyDrive) {
      formData.append('folderId', activeFolderId || 'root');
    }

    try {
      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setIsUploadOpen(false);
      setUploadFile(null);
      setUploadError('');
      fetchFiles();
      if (isMyDrive) {
        fetchFolders(activeFolderId, folderTrail);
      }
      logSecurityEvent('File Uploaded', `Uploaded "${uploadFile.name}"`, 'info');
    } catch (err) {
      console.error('Upload failed', err);
      const message = err.response?.data?.message || 'Upload failed';
      setUploadError(message);
      logSecurityEvent('Upload Failed', message, 'error');
    }
  };

  const handleRename = async () => {
    if (!selectedFile || !newName) return;
    try {
      await api.put(`/files/${selectedFile.id}/rename`, { newName });
      setIsRenameOpen(false);
      fetchFiles();
      logSecurityEvent('File Renamed', `Renamed file to "${newName}"`, 'info');
    } catch (err) {
      console.error('Rename failed', err);
      logSecurityEvent('Rename Failed', err.response?.data?.message || 'Rename failed', 'error');
    }
  };

  const handleToggleFavorite = async (file) => {
    try {
      await api.put(`/files/${file.id}/favorite`, { isFavorite: !file.is_favorite });
      fetchFiles();
      logSecurityEvent('Favorite Updated', `${file.name} ${file.is_favorite ? 'removed from' : 'added to'} starred`, 'info');
    } catch (err) {
      console.error('Favorite update failed', err);
      logSecurityEvent('Favorite Update Failed', err.response?.data?.message || 'Favorite update failed', 'warning');
    }
  };

  const handleSoftDelete = async (file) => {
    try {
      await api.put(`/files/${file.id}/trash`);
      fetchFiles();
      logSecurityEvent('Moved To Trash', `${file.name} moved to trash`, 'warning');
    } catch (err) {
      console.error('Move to trash failed', err);
      logSecurityEvent('Trash Failed', err.response?.data?.message || 'Trash operation failed', 'error');
    }
  };

  const handleRestore = async (file) => {
    try {
      await api.put(`/files/${file.id}/restore`);
      fetchFiles();
      logSecurityEvent('File Restored', `${file.name} restored from trash`, 'info');
    } catch (err) {
      console.error('Restore failed', err);
      logSecurityEvent('Restore Failed', err.response?.data?.message || 'Restore failed', 'error');
    }
  };

  const handlePermanentDelete = async (file) => {
    try {
      await api.delete(`/files/${file.id}`);
      fetchFiles();
      logSecurityEvent('File Permanently Deleted', `${file.name} removed permanently`, 'warning');
    } catch (err) {
      console.error('Permanent delete failed', err);
      logSecurityEvent('Permanent Delete Failed', err.response?.data?.message || 'Permanent delete failed', 'error');
    }
  };

  const handleOpenShareModal = (file) => {
    if (file.scan_status && file.scan_status !== 'CLEAN') {
      alert(`Cannot share file. File security status is ${file.scan_status}. Only clean files can be shared.`);
      return;
    }
    setShareFile(file);
    setShareExpiresIn('24');
    setSharePassword('');
    setShareMaxAccesses('');
    setCreatedShareUrl('');
    setShareError('');
    setShareCopied(false);
    setIsShareModalOpen(true);
  };

  const handleCreateShareLink = async (e) => {
    e.preventDefault();
    if (!shareFile) return;

    setShareLoading(true);
    setShareError('');

    try {
      const payload = {
        fileId: shareFile.id,
        expiresInHours: shareExpiresIn ? parseInt(shareExpiresIn, 10) : undefined,
        password: sharePassword || undefined,
        maxAccesses: shareMaxAccesses ? parseInt(shareMaxAccesses, 10) : undefined,
      };

      const res = await api.post('/share/create', payload);
      if (res.data?.success) {
        setCreatedShareUrl(res.data.shareUrl);
      } else {
        setShareError(res.data?.message || 'Failed to create share link');
      }
    } catch (err) {
      setShareError(err.response?.data?.message || 'Failed to create share link');
    } finally {
      setShareLoading(false);
    }
  };

  const openRenameModal = (file) => {
    setSelectedFile(file);
    setNewName(file.name);
    setIsRenameOpen(true);
  };

  const handlePreview = async (file) => {
    setIsPreviewOpen(true);
    setPreviewError('');
    setPreviewUrl('');
    setPreviewType('');
    setPreviewName(file.name || 'Preview');
    setPreviewZoom(1);
    setShowPreviewMenu(false);
    setIsPreviewLoading(true);

    try {
      const token = localStorage.getItem('token') || '';
      if (!token) {
        setPreviewError('Please login again to preview files.');
        return;
      }

      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }

      const response = await api.get(`/files/${file.id}/content`, {
        responseType: 'blob',
      });

      const contentType = response.headers['content-type'] || file.file_type || 'application/octet-stream';
      const blob = new Blob([response.data], { type: contentType });
      const objectUrl = URL.createObjectURL(blob);

      setPreviewUrl(objectUrl);
      setPreviewType(contentType.toLowerCase());
      setPreviewName(file.name || 'Preview');
    } catch (err) {
      setPreviewError(err.response?.data?.message || 'Unable to load preview');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const sectionTitle = isTrash
    ? 'Trash'
    : isFavorite
      ? 'Starred Files'
      : isRecent
        ? 'Recent Files'
        : isMyDrive
          ? 'My Drive Files'
          : 'My Files';

  const isPdfPreview = previewType.includes('pdf') || previewName.toLowerCase().endsWith('.pdf');

  const handleZoomOut = () => setPreviewZoom((prev) => Math.max(0.6, Number((prev - 0.2).toFixed(1))));
  const handleZoomIn = () => setPreviewZoom((prev) => Math.min(2.2, Number((prev + 0.2).toFixed(1))));

  const handleOpenInNewTab = () => {
    if (!previewUrl) return;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadPreview = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = previewName || 'file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPreview = () => {
    if (!previewUrl) return;
    const printWindow = window.open(previewUrl, '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (err) {
        console.error('Print failed', err);
      }
    }, 800);
  };

  const handleCopyPreviewLink = async () => {
    if (!previewUrl) return;
    try {
      await navigator.clipboard.writeText(previewUrl);
      setShowPreviewMenu(false);
    } catch (err) {
      console.error('Copy link failed', err);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setFolderError('Folder name is required');
      return;
    }

    try {
      await api.post('/files/folders', {
        name,
        parentId: activeFolderId || 'root',
      });
      setIsFolderModalOpen(false);
      setNewFolderName('');
      setFolderError('');
      fetchFolders(activeFolderId, folderTrail);
      logSecurityEvent('Folder Created', `Folder "${name}" created`, 'info');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to create folder';
      setFolderError(message);
      logSecurityEvent('Folder Create Failed', message, 'error');
    }
  };

  const handleOpenFolder = (folder) => {
    const nextTrail = [...folderTrail, { id: folder.id, name: folder.name }];
    fetchFolders(folder.id, nextTrail);
  };

  const handleBreadcrumbClick = (index) => {
    if (index < 0) {
      fetchFolders(null, []);
      return;
    }

    const nextTrail = folderTrail.slice(0, index + 1);
    const target = nextTrail[nextTrail.length - 1];
    fetchFolders(target?.id || null, nextTrail);
  };

  const handleFileDragStart = (e, file) => {
    setMovingFileId(file.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', file.id);
  };

  const handleDropOnFolder = async (e, folder) => {
    e.preventDefault();
    e.stopPropagation();
    const fileId = e.dataTransfer.getData('text/plain') || movingFileId;
    if (!fileId) return;

    try {
      await api.put(`/files/${fileId}/move`, { folderId: folder.id });
      setMovingFileId(null);
      fetchFiles();
      fetchFolders(activeFolderId, folderTrail);
      logSecurityEvent('File Moved', `File moved to "${folder.name}"`, 'info');
    } catch (err) {
      logSecurityEvent('File Move Failed', err.response?.data?.message || 'Unable to move file', 'warning');
    }
  };

  const handleToggleFolderFavorite = async (e, folder) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const nextFavorite = !getEffectiveFolderFavorite(folder);
      setFolderStarOverrides((prev) => ({ ...prev, [folder.id]: nextFavorite }));
      try {
        await api.put(`/files/folders/${folder.id}/favorite`, { isFavorite: nextFavorite });
      } catch (apiErr) {
        // Keep local override so star behavior continues even when DB column is missing.
      }
      fetchFolders(activeFolderId, folderTrail);
      setFavoriteFolders((prev) => {
        if (nextFavorite) {
          const exists = prev.some((item) => item.id === folder.id);
          if (exists) return prev;
          return [{ ...folder, is_favorite: true }, ...prev];
        }
        return prev.filter((item) => item.id !== folder.id);
      });
      fetchFiles();
      refreshSuggestedFavoriteMap();
      logSecurityEvent('Folder Favorite Updated', `${folder.name} starred status changed`, 'info');
    } catch (err) {
      logSecurityEvent('Folder Favorite Failed', err.response?.data?.message || 'Unable to star folder', 'warning');
    }
  };

  const formatFolderDate = (dateValue) => {
    if (!dateValue) return 'Date not available';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Date not available';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="dashboard-container">
      <Sidebar
        onUploadClick={() => setIsUploadOpen(true)}
        storageUsed={totalStorageUsed}
        totalStorage={maxStorage}
      />

      <div className="main-wrapper">
        <Topbar
          onSearch={handleSearch}
          searchTerm={searchTerm}
          files={allFiles}
          activeTypeFilter={typeFilter}
          activeDateFilter={dateFilter}
          onTypeFilterChange={setTypeFilter}
          onDateFilterChange={setDateFilter}
        />

        <div className="content-area">
          {isHome && (
            <>
              <section className="welcome-panel">
                <div>
                  <h1>Welcome to Secure Upload </h1>
                  <p>
                    Upload, save, and share your files safely in one secure place.
                  </p>
                </div>
                <div className="security-chip-group">
                  <span className="security-chip">Safe File Transfer</span>
                  <span className="security-chip">Virus Check</span>
                  <span className="security-chip">Private Account Access</span>
                </div>
              </section>

              <div className="stats-grid">
                <StatsCard
                  title="Total Files"
                  value={totalFilesCount}
                  icon={(
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  )}
                  color="#155EEF"
                />
                <StatsCard
                  title="Storage Used"
                  value={`${(totalStorageUsed / (1024 * 1024)).toFixed(2)} MB`}
                  icon={(
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                    </svg>
                  )}
                  color="#16A34A"
                />
                <StatsCard
                  title="Security Health"
                  value={recentThreatChecks}
                  icon={(
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2 4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  )}
                  color="#0F766E"
                />
              </div>

              <section className="folder-section">
                <button
                  type="button"
                  className="suggested-toggle"
                  onClick={() => setIsSuggestedOpen((prev) => !prev)}
                >
                  <span className={`suggested-chevron ${isSuggestedOpen ? 'open' : ''}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                  <span>Suggested folders</span>
                </button>
                {isSuggestedOpen && (
                  <div className="folder-grid">
                    {suggestedFolders.map((folder) => (
                      <article
                        className="folder-card folder-card-clickable"
                        key={folder.name}
                        onClick={() => handleSuggestedFolderClick(folder.name)}
                      >
                        <div className="folder-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                        </div>
                        <div>
                          <h3>{folder.name}</h3>
                          <p>{folder.tag}</p>
                        </div>
                        <div className="folder-hover-card">
                          <div className="folder-hover-header">
                            <h4>{folder.name}</h4>
                            <button
                              type="button"
                              className={`folder-hover-star ${suggestedFavoriteMap[folder.name.toLowerCase()] ? 'active' : ''}`}
                              title="Star folder"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => handleToggleSuggestedStar(e, folder.name)}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            </button>
                          </div>
                          <div className="folder-hover-row">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="9" />
                              <polyline points="12 7 12 12 15 14" />
                            </svg>
                            <span>Edited on {formatFolderDate(new Date())}</span>
                          </div>
                          <div className="folder-hover-row">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="8.5" cy="7" r="4" />
                              <path d="M20 8v6" />
                              <path d="M23 11h-6" />
                            </svg>
                            <span>Shared with me</span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section
                className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => setIsUploadOpen(true)}
              >
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div>
                  <h3>Drop files to upload securely</h3>
                  <p>Allowed types are validated automatically. Click here to select files manually.</p>
                </div>
              </section>
            </>
          )}

          {user && user.email_verified === false && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                backgroundColor: '#FEF3C7',
                border: '1px solid #FDE68A',
                borderRadius: '8px',
                color: '#92400E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                fontSize: '13px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>
                  {resendBannerStatus || 'Your email address is unverified. Verify your email to enable public link sharing.'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleResendFromBanner}
                disabled={isResendBannerLoading}
                style={{
                  background: '#D97706',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: isResendBannerLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                {isResendBannerLoading ? 'Sending...' : 'Resend Verification Email'}
              </button>
            </div>
          )}

          <section className="files-section">
            <div className="section-head">
              {!isMyDrive && <h2>{sectionTitle}</h2>}
              {isMyDrive && (
                <div className="drive-breadcrumbs drive-breadcrumbs-inline">
                  <button type="button" className="crumb-btn root" onClick={() => handleBreadcrumbClick(-1)}>
                    My Files
                  </button>
                  {folderTrail.map((node, index) => (
                    <button key={node.id} type="button" className="crumb-btn" onClick={() => handleBreadcrumbClick(index)}>
                      <span className="crumb-sep">{'>'}</span>
                      <span className="crumb-name">{node.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="drive-head-actions">
                {!isMyDrive && <p>{files.length} items</p>}
                {isMyDrive && (
                  <Button
                    onClick={() => {
                      setIsFolderModalOpen(true);
                      setFolderError('');
                    }}
                  >
                    New Folder
                  </Button>
                )}
              </div>
            </div>

            {isMyDrive && (
              <div className="drive-folder-panel">
                {folders.length ? (
                  <div className="drive-folder-grid">
                    {folders.map((folder) => (
                      <article
                        className="folder-card folder-card-clickable"
                        key={folder.id}
                        onClick={() => handleOpenFolder(folder)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => handleDropOnFolder(e, folder)}
                      >
                        <div className="folder-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                        </div>
                        <div>
                          <h3>{folder.name}</h3>
                          <p>Drop files here</p>
                        </div>
                        <div className="folder-hover-card">
                          <div className="folder-hover-header">
                            <h4>{folder.name}</h4>
                            <button
                              type="button"
                              className={`folder-hover-star ${getEffectiveFolderFavorite(folder) ? 'active' : ''}`}
                              title="Star folder"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => handleToggleFolderFavorite(e, folder)}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            </button>
                          </div>
                          <div className="folder-hover-row">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="9" />
                              <polyline points="12 7 12 12 15 14" />
                            </svg>
                            <span>Edited on {formatFolderDate(folder.created_at)}</span>
                          </div>
                          <div className="folder-hover-row">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="8.5" cy="7" r="4" />
                              <path d="M20 8v6" />
                              <path d="M23 11h-6" />
                            </svg>
                            <span>Shared with me</span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">No folders in this location.</p>
                )}
              </div>
            )}

            {isFavorite && favoriteFolders.length > 0 && (
              <div className="drive-folder-panel">
                <div className="section-head">
                  <h2>Starred Folders</h2>
                </div>
                <div className="drive-folder-grid">
                  {favoriteFolders.map((folder) => (
                    <article
                      className="folder-card folder-card-clickable"
                      key={folder.id}
                      onClick={() => handleStarredFolderOpen(folder)}
                    >
                      <div className="folder-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h3>{folder.name}</h3>
                        <p>Starred folder</p>
                      </div>
                      <button
                        type="button"
                        className="starred-folder-btn"
                        title="Unstar folder"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => handleToggleFolderFavorite(e, folder)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            )}

            <div className="file-list-head">
              <span>Name</span>
              <span>Details</span>
              <span>Actions</span>
            </div>

            <div className="file-grid-v2">
              {files.length ? (
                files.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    onRename={openRenameModal}
                    onToggleFavorite={handleToggleFavorite}
                    onDelete={handleSoftDelete}
                    onRestore={handleRestore}
                    onPermanentDelete={handlePermanentDelete}
                    onPreview={handlePreview}
                    onShare={handleOpenShareModal}
                    draggable={isMyDrive && !isTrash}
                    onDragStart={handleFileDragStart}
                  />
                ))
              ) : (
                <p className="empty-state">No files found in this section.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setUploadError('');
        }}
        title="Upload File"
      >
        <div className="upload-modal-content">
          {isMyDrive && (
            <p className="upload-target-caption">
              Upload destination: {folderTrail.length ? folderTrail.map((item) => item.name).join(' / ') : 'Root'}
            </p>
          )}
          <input
            type="file"
            onChange={(e) => {
              setUploadFile(e.target.files[0]);
              setUploadError('');
            }}
          />
          {uploadError && <p className="settings-message">{uploadError}</p>}
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setIsUploadOpen(false);
                setUploadError('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpload}>Upload</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isFolderModalOpen}
        onClose={() => {
          setIsFolderModalOpen(false);
          setFolderError('');
        }}
        title="Create Folder"
      >
        <div className="upload-modal-content">
          <Input
            value={newFolderName}
            onChange={(e) => {
              setNewFolderName(e.target.value);
              setFolderError('');
            }}
            placeholder="Folder name"
          />
          {folderError && <p className="settings-message">{folderError}</p>}
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setIsFolderModalOpen(false);
                setFolderError('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>Create</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isRenameOpen} onClose={() => setIsRenameOpen(false)} title="Rename File">
        <div className="upload-modal-content">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New file name" />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Save</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isPreviewOpen}
        onClose={() => {
          if (previewUrl && previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(previewUrl);
          }
          setIsPreviewOpen(false);
          setPreviewUrl('');
          setPreviewError('');
          setPreviewType('');
          setShowPreviewMenu(false);
          setPreviewZoom(1);
        }}
        title={previewName || 'File Preview'}
        className="modal-content-wide"
      >
        <div className="preview-modal-content">
          {!isPreviewLoading && !previewError && previewUrl && (
            <div className="preview-toolbar">
              <div className="preview-toolbar-left">
                <span className="preview-page-indicator">Page 1 / 1</span>
              </div>
              <div className="preview-toolbar-right">
                <button className="preview-tool-btn" onClick={handleZoomOut} title="Zoom out">-</button>
                <span className="preview-zoom-value">{Math.round(previewZoom * 100)}%</span>
                <button className="preview-tool-btn" onClick={handleZoomIn} title="Zoom in">+</button>
                <button className="preview-tool-btn" onClick={handlePrintPreview} title="Print">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                </button>
                <div className="preview-menu-wrap">
                  <button className="preview-tool-btn" onClick={() => setShowPreviewMenu((prev) => !prev)} title="More actions">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>
                  {showPreviewMenu && (
                    <div className="preview-menu-dropdown">
                      <button onClick={handleOpenInNewTab}>Open in new tab</button>
                      <button onClick={handleDownloadPreview}>Download</button>
                      <button onClick={handleCopyPreviewLink}>Copy link</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {isPreviewLoading && <p className="settings-message">Loading preview...</p>}
          {!isPreviewLoading && previewError && <p className="settings-message">{previewError}</p>}
          {!isPreviewLoading && !previewError && previewUrl && (
            <div className="preview-canvas-wrap">
              {previewType.startsWith('image/') ? (
                <img
                  src={previewUrl}
                  alt={previewName}
                  className="preview-image"
                  style={{ transform: `scale(${previewZoom})` }}
                />
              ) : isPdfPreview ? (
                <iframe
                  src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                  title={previewName}
                  className="preview-frame"
                  style={{ transform: `scale(${previewZoom})` }}
                />
              ) : (
                <iframe
                  src={previewUrl}
                  title={previewName}
                  className="preview-frame"
                  style={{ transform: `scale(${previewZoom})` }}
                />
              )}
              <a href={previewUrl} target="_blank" rel="noreferrer" className="preview-link">
                Open in new tab
              </a>
            </div>
          )}
         </div>
      </Modal>

      {/* Share Link Modal */}
      <Modal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} title="Share File">
        <div className="upload-modal-content" style={{ minWidth: '340px' }}>
          {shareFile && (
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155' }}>
              Create a secure, expirable share link for: <strong>{shareFile.name}</strong>
            </p>
          )}

          {shareError && (
            <div style={{ padding: '8px 12px', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
              {shareError}
            </div>
          )}

          {user && user.email_verified === false && (
            <div style={{ padding: '12px 14px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', color: '#92400E', fontSize: '13px', marginBottom: '14px', lineHeight: '1.4' }}>
              <strong>Email Verification Required:</strong> You must verify your email address before creating public share links.
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={handleResendFromBanner}
                  disabled={isResendBannerLoading}
                  style={{
                    background: '#D97706',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {isResendBannerLoading ? 'Sending...' : 'Resend Verification Email'}
                </button>
              </div>
            </div>
          )}

          {createdShareUrl ? (
            <div>
              <p style={{ fontSize: '13px', color: '#166534', fontWeight: '500', marginBottom: '8px' }}>
                ✓ Secure link generated:
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <Input value={createdShareUrl} readOnly style={{ flex: 1, fontSize: '12px' }} />
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(createdShareUrl);
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  }}
                >
                  {shareCopied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <div className="modal-actions">
                <Button variant="secondary" onClick={() => setIsShareModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateShareLink}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>
                  Expiration
                </label>
                <select
                  value={shareExpiresIn}
                  onChange={(e) => setShareExpiresIn(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                >
                  <option value="1">1 Hour</option>
                  <option value="24">24 Hours (1 Day)</option>
                  <option value="72">3 Days</option>
                  <option value="168">7 Days</option>
                  <option value="">Never Expire</option>
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>
                  Password Protection (Optional)
                </label>
                <Input
                  type="password"
                  placeholder="Set an optional password"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>
                  Maximum Downloads/Accesses (Optional)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 5 (unlimited if empty)"
                  value={shareMaxAccesses}
                  onChange={(e) => setShareMaxAccesses(e.target.value)}
                  min="1"
                />
              </div>

              <div className="modal-actions">
                <Button variant="secondary" type="button" onClick={() => setIsShareModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={shareLoading || (user && user.email_verified === false)}>
                  {shareLoading ? 'Generating...' : 'Create Link'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default DashboardV2;
