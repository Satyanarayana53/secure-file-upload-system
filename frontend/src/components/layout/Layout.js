import { useSearchParams } from 'react-router-dom';
import '../../styles/layout.css';
import '../../styles/dashboardV2.css';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const Layout = ({ children }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = searchParams.get('search') || '';

  const handleSearch = (term) => {
    if (term) {
      setSearchParams({ search: term });
      return;
    }
    setSearchParams({});
  };

  return (
    <div className="layout dashboard-container">
      <Sidebar storageUsed={0} totalStorage={100 * 1024 * 1024} onUploadClick={() => {}} />
      <div className="main-content main-wrapper">
        <Topbar onSearch={handleSearch} searchTerm={searchTerm} />
        <div className="content-wrapper content-area">{children}</div>
      </div>
    </div>
  );
};

export default Layout;
