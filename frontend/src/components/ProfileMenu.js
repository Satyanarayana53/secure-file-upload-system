import { useRef } from "react";
import api from "../api";
import "../styles/ProfileMenu.css";

function ProfileMenu({ user, setUser, onLogout }) {
  const fileRef = useRef();

  const uploadPhoto = async (e) => {
    const form = new FormData();
    form.append("photo", e.target.files[0]);

    const res = await api.post("/user/profile-pic", form, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    });

    setUser(prev => ({
      ...prev,
      profile_pic: res.data.profile_pic
    }));
  };

  const removePhoto = async () => {
    const res = await api.delete("/user/profile-pic", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    });

    setUser(prev => ({
      ...prev,
      profile_pic: res.data.profile_pic
    }));
  };

  if (!user) return null;

  return (
    <div className="profile-menu">
      <img
        src={user.profile_pic === "default.png" ? "/default-avatar.png":`http://localhost:5000/uploads/profile/${user.profile_pic}`}
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
        accept="image/*"
        onChange={uploadPhoto}
      />

      <button className="logout" onClick={onLogout}>
        Logout
      </button>
    </div>
  );
}

export default ProfileMenu;
