import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import FileCard from '../components/FileCard';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import api from '../services/api';
import '../styles/dashboard.css';

const Dashboard = () => {
  const [files, setFiles] = useState([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [newName, setNewName] = useState('');
  
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const searchTerm = searchParams.get('search') || '';

  const fetchFiles = async () => {
    try {
      const isTrash = location.pathname === '/trash';
      const isFavorite = location.pathname === '/favorites';
      const isRecent = location.pathname === '/recent';

      const res = await api.get(`/files?trash=${isTrash}&favorite=${isFavorite}`);
      
      let data = res.data;

      // Frontend filtering for search and "Recent" (last 7 days)
      if (searchTerm) {
        data = data.filter(f => f.file_name.toLowerCase().includes(searchTerm.toLowerCase()));
      }

      if (isRecent) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        data = data.filter(f => new Date(f.created_at) > sevenDaysAgo);
      }

      // Map backend fields to frontend expected format if necessary, 
      // but we updated backend to match mostly. 
      // Backend returns: file_name, file_size, created_at, id, is_favorite, is_deleted
      const mappedFiles = data.map(f => ({
        id: f.id,
        name: f.file_name,
        file_size: f.file_size,
        created_at: f.created_at,
        is_favorite: f.is_favorite,
        is_deleted: f.is_deleted
      }));

      setFiles(mappedFiles);
    } catch (err) {
      console.error("Failed to fetch files", err);
    }
  };

  useEffect(() => {
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, searchTerm]);

  const handleFileChange = (e) => {
    setUploadFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    const formData = new FormData();
    formData.append('file', uploadFile);
    
    try {
      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setIsUploadOpen(false);
      setUploadFile(null);
      alert('File uploaded successfully');
      fetchFiles();
    } catch (err) {
      console.error(err);
      alert('Upload failed');
    }
  };

  const handleRename = async () => {
    if (!selectedFile || !newName) return;
    try {
      await api.put(`/files/${selectedFile.id}/rename`, { newName });
      setIsRenameOpen(false);
      fetchFiles();
    } catch (err) {
      alert('Rename failed');
    }
  };

  const handleToggleFavorite = async (file) => {
    try {
      await api.put(`/files/${file.id}/favorite`, { isFavorite: !file.is_favorite });
      fetchFiles();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSoftDelete = async (file) => {
    if (!window.confirm("Move to trash?")) return;
    try {
      await api.put(`/files/${file.id}/trash`);
      fetchFiles();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestore = async (file) => {
    try {
      await api.put(`/files/${file.id}/restore`);
      fetchFiles();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePermanentDelete = async (file) => {
    if (!window.confirm("Delete permanently? This cannot be undone.")) return;
    try {
      await api.delete(`/files/${file.id}`);
      fetchFiles();
    } catch (err) {
      console.error(err);
    }
  };

  const openRenameModal = (file) => {
    setSelectedFile(file);
    setNewName(file.name);
    setIsRenameOpen(true);
  };

  return (
    <Layout>
      <div className="dashboard-header">
        <h2>
          {location.pathname === '/home' && 'My Files'}
          {location.pathname === '/recent' && 'Recent Files'}
          {location.pathname === '/favorites' && 'Favorites'}
          {location.pathname === '/trash' && 'Trash'}
        </h2>
        <Button onClick={() => setIsUploadOpen(true)}>+ Upload File</Button>
      </div>
      
      <div className="file-grid">
        {files.map(file => (
          <FileCard 
            key={file.id} 
            file={file} 
            onRename={openRenameModal}
            onToggleFavorite={handleToggleFavorite}
            onDelete={handleSoftDelete}
            onRestore={handleRestore}
            onPermanentDelete={handlePermanentDelete}
          />
        ))}
        {files.length === 0 && <p>No files found.</p>}
      </div>

      <Modal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} title="Upload File">
        <div className="upload-modal-content">
          <input type="file" onChange={handleFileChange} />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload}>Upload</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isRenameOpen} onClose={() => setIsRenameOpen(false)} title="Rename File">
        <div className="upload-modal-content">
          <Input 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)} 
            placeholder="New file name" 
          />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename}>Save</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};

export default Dashboard;