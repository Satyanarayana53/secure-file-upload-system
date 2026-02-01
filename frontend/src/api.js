import axios from "axios";

const api = axios.create({
  baseURL: "https://secure-file-upload-system-m6jq.onrender.com/api",
});

api.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

export default api;
