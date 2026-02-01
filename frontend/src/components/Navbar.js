import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav style={{
      padding: "15px",
      background: "#111",
      color: "#fff",
      display: "flex",
      justifyContent: "space-between"
    }}>
      <h3>SecureUpload</h3>
      <div>
        <Link to="/" style={{color:"#fff", marginRight:15}}>Register</Link>
        <Link to="/login" style={{color:"#fff"}}>Login</Link>
      </div>
    </nav>
  );
}

export default Navbar;
