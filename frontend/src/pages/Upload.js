import { useEffect, useRef, useState } from "react";
import { FaEllipsisV, FaFileAlt, FaFileExcel, FaFileImage, FaFilePdf, FaFilePowerpoint, FaFileWord } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import api from "../api";
import ProfileMenu from "../components/ProfileMenu";
import "../styles/Auth.css";


function Upload() {
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");

  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const [showProfile, setShowProfile] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("my");

  const [openMenuId, setOpenMenuId] = useState(null);

  const getFileIcon = (file) => {
  const name = file.original_name.toLowerCase();

  if (file.file_type?.startsWith("image")) return <FaFileImage color="#4caf50" />;
  if (name.endsWith(".pdf")) return <FaFilePdf color="#e53935" />;
  if (name.endsWith(".doc") || name.endsWith(".docx")) return <FaFileWord color="#1565c0" />;
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) return <FaFileExcel color="#2e7d32" />;
  if (name.endsWith(".ppt") || name.endsWith(".pptx")) return <FaFilePowerpoint color="#ef6c00" />;

  return <FaFileAlt color="#555" />;
};


  useEffect(() => {
    api.get("/user/profile", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    })
      .then(res => setUser(res.data))
      .catch(() => navigate("/login"));
  }, [navigate]);

  const fetchFiles = async (tab) => {
    try {
      setLoading(true);
      const res = await api.get(`/files?type=${tab}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      setFiles(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(activeTab);
  }, [activeTab]);

  const upload = async () => {
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    try {
      await api.post("/upload", form, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchFiles("my");

    } catch (err) {
      alert("⚠️ Malicious or unsafe file detected. Upload blocked.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleStar = async (id) => {
    await api.put(`/files/star/${id}`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    fetchFiles(activeTab);
  };

  const deleteFile = async (id) => {
    await api.delete(`/files/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    fetchFiles(activeTab);
  };

  const restoreFile = async (id) => {
    await api.put(`/files/restore/${id}`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    fetchFiles("trash");
  };

  const permanentDelete = async (id) => {
    if (!window.confirm("Delete permanently? This cannot be undone.")) return;

    await api.delete(`/files/permanent/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    fetchFiles("trash");
  };

  const downloadFile = async (id) => {
  try {
    const token = localStorage.getItem("token");

    const response = await fetch(
      `http://localhost:5000/api/files/download/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) return;

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();

  } catch (err) {
    console.error("Download failed");
  }
};

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const filteredFiles = files.filter(f =>
    f.original_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app-wrapper">
      
      <div className="dashboard-header">
        <div className="brand-logo">SecureUpload</div>

        <div className="search-bar" style={{ position: "relative" }}>
          <input
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none"
            }}
          >
            🔍
          </span>
        </div>

        <div className="header-right" style={{ position: "relative" }}>
          {user && (
            <img
              src={
                user.profile_pic === "default.png"
                  ? "/default-avatar.png"
                  : `http://localhost:5000/uploads/profile/${user.profile_pic}`
              }
              className="header-profile-pic"
              alt="profile"
              onClick={() => setShowProfile(!showProfile)}
            />
          )}

          {showProfile && (
            <ProfileMenu
              user={user}
              setUser={setUser}
              onLogout={handleLogout}
            />
          )}
        </div>
      </div>

      <div className="dashboard-container">
        <div className="sidebar">
          <div className={`menu-item ${activeTab === "my" ? "active" : ""}`}
            onClick={() => setActiveTab("my")}>📂 My Files</div>

          <div className={`menu-item ${activeTab === "recent" ? "active" : ""}`}
            onClick={() => setActiveTab("recent")}>🕒 Recent</div>

          <div className={`menu-item ${activeTab === "starred" ? "active" : ""}`}
            onClick={() => setActiveTab("starred")}>⭐ Starred</div>

          <div className={`menu-item ${activeTab === "trash" ? "active" : ""}`}
            onClick={() => setActiveTab("trash")}>🗑️ Trash</div>
          
        </div>
          
        <div className="main-content">
          <h2>Welcome, {user?.username}</h2>

          {activeTab === "my" && (
            <div className="upload-section">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={e => setFile(e.target.files[0])}
              />

              <button
                className="upload-btn"
                onClick={() => fileInputRef.current.click()}
              >
                {file ? file.name : "Choose File"}
              </button>

              {file && (
                <>
                  <br /><br />
                  <button
                    className="upload-btn"
                    style={{ background: "#00ba88" }}
                    onClick={upload}
                  >
                    Confirm Upload
                  </button>
                </>
              )}
            </div>
          )}

          <h3 style={{ marginTop: "30px" }}>
            {activeTab === "my" && "My Files"}
            {activeTab === "recent" && "Recent Files"}
            {activeTab === "starred" && "Starred Files"}
            {activeTab === "trash" && "Trash"}
          </h3>

          {loading && <p>Loading files...</p>}

          <div className="files-grid">
            {!loading && filteredFiles.length === 0 && <p>No files found</p>}

            {filteredFiles.map(f => (
              <div className="file-card" key={f.id}>
                <span className="file-icon">
                  {getFileIcon(f)}
                </span>

                <p title={f.original_name}>{f.original_name}</p>

               <div className="file-actions" style={{ position: "relative" }}>
              <button
                onClick={() =>
                  setOpenMenuId(openMenuId === f.id ? null : f.id)
                }
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <FaEllipsisV />
              </button>
              
              {openMenuId === f.id && (
                <div className="file-menu">
                  {activeTab !== "trash" ? (
                    <>
                      <button onClick={() => toggleStar(f.id)}>
                        {f.is_starred ? "Unstar" : "Star"}
                      </button>
                  
                      <button onClick={() => downloadFile(f.id)}>
                        Download
                      </button>
                  
                      <button onClick={() => deleteFile(f.id)}>
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => restoreFile(f.id)}>
                        Restore
                      </button>
                  
                      <button onClick={() => permanentDelete(f.id)}>
                        Delete Permanently
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>  );
}

export default Upload;
