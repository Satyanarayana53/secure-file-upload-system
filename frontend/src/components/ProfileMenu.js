import { useRef } from "react";
import api from "../api";
import "../styles/ProfileMenu.css";

function ProfileMenu({ user, setUser, onLogout }) {
  const fileRef = useRef();

  const BACKEND_URL = "https://secure-file-upload-system-m6jq.onrender.com";

  const uploadPhoto = async (e) => {
    try {
      const form = new FormData();
      form.append("photo", e.target.files[0]);

      const res = await api.post("/user/profile-pic", form, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "multipart/form-data"
        }
      });

      setUser(prev => ({
        ...prev,
        profile_pic: res.data.profile_pic
      }));

    } catch (err) {
      alert("Upload failed");
      console.error(err);
    }
  };

  const removePhoto = async () => {
    try {
      const res = await api.delete("/user/profile-pic", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });

      setUser(prev => ({
        ...prev,
        profile_pic: res.data.profile_pic
      }));

    } catch (err) {
      alert("Remove failed");
      console.error(err);
    }
  };

  if (!user) return null;

  const imageSrc =
    user.profile_pic === "default.png"
      ? "/default-avatar.png"
      : `${BACKEND_URL}/uploads/profile/${user.profile_pic}`;

  return (
    <div className="profile-menu">
      <img
        src={imageSrc}
        alt="profile"
        className="profile-img"
      />

      <h4>{user.username}</h4>
      <p>{user.email}</p>

      <button onClick={() => fileRef.current.click()}>
        Change Photo
      </button>

      {user.profile_pic !== "default.png" && (
        <button className="remove-btn" onClick={removePhoto}>
          Remove Photo
        </button>
      )}

      <input
        type="file"
        hidden
        ref={fileRef}
        accept="image/png, image/jpeg"
        onChange={uploadPhoto}
      />

      <button className="logout" onClick={onLogout}>
        Logout
      </button>
    </div>
  );
}

export default ProfileMenu;
