import { useSearchParams } from 'react-router-dom';
import '../../styles/layout.css';
import ProfileDropdown from '../ProfileDropdown';
import Input from '../ui/Input';

const Navbar = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = searchParams.get('search') || '';

  const handleSearch = (e) => {
    const term = e.target.value;
    if (term) {
      setSearchParams({ search: term });
    } else {
      setSearchParams({});
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-search" style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="18" 
          height="18" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            pointerEvents: 'none'
          }}
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <Input 
          placeholder="Search files..." 
          onChange={handleSearch} 
          value={searchTerm} 
          style={{ paddingLeft: '40px' }}
        />
      </div>
      <div className="navbar-actions">
        <ProfileDropdown />
      </div>
    </nav>
  );
};

export default Navbar;